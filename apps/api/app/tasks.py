import asyncio
from datetime import datetime
from celery import Celery
from sqlalchemy import select
from .config import get_settings
from .db import SessionLocal
from .billing import refund_credits
from .models import Asset, AssetType, Job, JobEvent, JobStatus, PromptVersion
from .router import resolve_endpoint
from .runpod_client import RunPodClient
from .r2 import key_from_public_url, presign_get
from .workflows import load_workflow


settings = get_settings()
celery_app = Celery("saar", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.task_routes = {"apps.api.app.tasks.process_job": {"queue": "gpu"}}


def add_event(db, job_id: str, event_type: str, message: str, meta: dict | None = None) -> None:
    db.add(JobEvent(job_id=job_id, event_type=event_type, message=message, meta=meta or {}))
    db.commit()


async def _process_job_async(job_id: str) -> None:
    db = SessionLocal()
    try:
        job = db.get(Job, job_id)
        if not job:
            return

        endpoint = resolve_endpoint(db, job.task_type, job.model_key)
        job.status = JobStatus.running
        job.started_at = datetime.utcnow()
        job.model_key = endpoint.key
        job.runpod_endpoint_id = endpoint.endpoint_id
        db.commit()
        add_event(db, job.id, "routing", f"Selected {endpoint.model_name}", {"endpoint": endpoint.endpoint_id})

        input_asset = db.get(Asset, job.input_asset_id) if job.input_asset_id else None
        prompt_version = db.execute(select(PromptVersion).where(PromptVersion.job_id == job.id).order_by(PromptVersion.created_at.desc())).scalars().first()
        model_prompt = prompt_version.final_prompt if prompt_version else job.prompt
        model_negative = prompt_version.negative_prompt if prompt_version else job.negative_prompt
        generation_packet = prompt_version.generation_packet if prompt_version else {}
        workflow_values = {
            "prompt": model_prompt,
            "negative_prompt": model_negative or "",
            "seed": job.options.get("seed", -1),
            "input_image_name": input_asset.r2_key.split("/")[-1] if input_asset else None,
            "input_video_name": input_asset.r2_key.split("/")[-1] if input_asset else None,
        }
        workflow = load_workflow(endpoint.workflow_file, workflow_values)
        input_files = []
        images = []
        if input_asset and input_asset.type in {AssetType.image, AssetType.video, AssetType.audio}:
            item = {
                "name": input_asset.r2_key.split("/")[-1],
                "url": presign_get(input_asset.r2_key),
                "type": input_asset.type.value,
                "mime_type": input_asset.mime_type,
            }
            input_files.append(item)
            if input_asset.type == AssetType.image:
                images.append(item)

        payload = {
            "workflow": workflow,
            "images": images,
            "files": input_files,
            "metadata": {
                "job_id": job.id,
                "task_type": job.task_type.value,
                "output_prefix": f"outputs/{job.id}",
                "generation_packet": generation_packet,
                "complexity": generation_packet.get("complexity") if isinstance(generation_packet, dict) else None,
            },
        }

        client = RunPodClient()
        submitted = await client.run(endpoint.endpoint_id, payload, settings.runpod_default_webhook)
        runpod_job_id = submitted.get("id")
        if not runpod_job_id:
            raise RuntimeError(f"RunPod did not return a job id: {submitted}")

        job.runpod_job_id = runpod_job_id
        job.status = JobStatus.submitted
        db.commit()
        add_event(db, job.id, "submitted", "Submitted job to RunPod", submitted)

        final_status = None
        for _ in range(int(job.options.get("max_poll_attempts", 180))):
            await asyncio.sleep(int(job.options.get("poll_seconds", 10)))
            status = await client.status(endpoint.endpoint_id, runpod_job_id)
            final_status = status
            state = status.get("status")
            add_event(db, job.id, "runpod_status", f"RunPod status: {state}", {"status": state})
            if state in {"COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"}:
                break

        if not final_status or final_status.get("status") != "COMPLETED":
            raise RuntimeError(f"RunPod job failed or timed out: {final_status}")

        output = final_status.get("output") or {}
        if isinstance(output, dict) and output.get("error"):
            raise RuntimeError(f"RunPod worker returned an error: {output.get('error')}")
        output_url = extract_output_url(output)
        if not output_url:
            raise RuntimeError(f"No output URL found in RunPod output: {output}")

        output_key = key_from_public_url(output_url) or f"external/runpod/{job.id}.mp4"
        asset = Asset(
            user_id=job.user_id,
            type=AssetType.video,
            r2_key=output_key,
            public_url=output_url,
            mime_type="video/mp4",
        )
        db.add(asset)
        db.flush()

        job.output_asset_id = asset.id
        job.status = JobStatus.completed
        job.completed_at = datetime.utcnow()
        db.commit()
        add_event(db, job.id, "completed", "Video generation completed", {"output_url": output_url})
    except Exception as exc:
        job = db.get(Job, job_id)
        if job:
            if (
                job.user_id
                and isinstance(job.options, dict)
                and job.options.get("billing_debited")
                and job.options.get("debited_credits")
                and not job.options.get("billing_refunded")
            ):
                try:
                    refund_credits(
                        db,
                        user_id=job.user_id,
                        amount=int(job.options["debited_credits"]),
                        job_id=job.id,
                        reason="automatic refund after generation failure",
                    )
                    job.options = {**job.options, "billing_refunded": True}
                except Exception as refund_exc:
                    add_event(db, job.id, "refund_failed", str(refund_exc))
            job.status = JobStatus.failed
            job.error = str(exc)
            job.completed_at = datetime.utcnow()
            db.commit()
            add_event(db, job.id, "failed", str(exc))
    finally:
        db.close()


def extract_output_url(output) -> str | None:
    if isinstance(output, str):
        return output if output.startswith("http") else None
    if isinstance(output, list):
        for item in output:
            found = extract_output_url(item)
            if found:
                return found
        return None
    if not isinstance(output, dict):
        return None

    data = output.get("data")
    if output.get("type") in {"s3_url", "url", "r2_url"} and isinstance(data, str) and data.startswith("http"):
        return data
    for key in ("video_url", "url", "output_url"):
        value = output.get(key)
        if isinstance(value, str) and value.startswith("http"):
            return value
    for collection_key in ("videos", "images", "files"):
        items = output.get(collection_key)
        if isinstance(items, list):
            for item in items:
                found = extract_output_url(item)
                if found:
                    return found
    for value in output.values():
        found = extract_output_url(value)
        if found:
            return found
    return None


@celery_app.task(name="apps.api.app.tasks.process_job")
def process_job(job_id: str) -> None:
    asyncio.run(_process_job_async(job_id))
