# Saar Generation Intelligence Layer

Saar does not send a raw prompt directly to the video model. It compiles a generation packet.

```text
Raw user idea
  -> clean brief
  -> memory retrieval
  -> subject lock
  -> visual world
  -> shot grammar
  -> continuity rules
  -> failure memory / negative rules
  -> scene complexity score
  -> model-specific prompt adapter
  -> ComfyUI workflow payload
```

## Generation Packet

Every job stores a packet in `prompt_versions.generation_packet`:

```json
{
  "intent": {},
  "subject_lock": {},
  "visual_world": {},
  "shot_grammar": {},
  "continuity_rules": [],
  "negative_rules": [],
  "active_memory": {},
  "complexity": {},
  "model_parameters": {}
}
```

## Memory Priority

Memory is not dumped into prompts. It is bucketed:

- `critical`: hard constraints
- `style` / `brand`: visual direction
- `subject`: identity/product lock
- `failure`: previous failures converted into future rules
- `optional`: planning influence only

Create memory:

```bash
curl -X POST "$API/api/memory" \
  -H "Authorization: Bearer $API_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "failure",
    "priority": 10,
    "content": "Do not allow hands to cover or touch the front logo during motion"
  }'
```

## Complexity Control

The compiler scores:

- people
- product
- location
- camera motion
- hand action
- text/logo
- premium detail

Decision:

| Score | Decision |
|---|---|
| 1-4 | `safe` |
| 5-6 | `acceptable` |
| 7+ | `split_into_smaller_clips` |

Future work: automatically split 7+ complexity jobs into multiple shot jobs.

## Inspecting The Packet

```bash
curl "$API/api/jobs/$JOB_ID/prompt-version" \
  -H "Authorization: Bearer $API_AUTH_TOKEN"
```

The frontend also shows the final model prompt and packet JSON in the active job panel.

