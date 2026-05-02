from datetime import datetime
from math import ceil
from sqlalchemy import select
from sqlalchemy.orm import Session
from .models import Coupon, CouponRedemption, CreditLedger, CreditWallet, LedgerType, PricingPlan, TaskType


DEFAULT_PLANS = [
    {
        "key": "starter",
        "name": "Starter",
        "price_npr": 999,
        "credits": 120,
        "max_video_seconds": 6,
        "max_jobs_per_month": 20,
        "features": ["Fast previews", "6-second videos", "Basic QA"],
    },
    {
        "key": "creator",
        "name": "Creator",
        "price_npr": 2999,
        "credits": 450,
        "max_video_seconds": 10,
        "max_jobs_per_month": 80,
        "features": ["Wan quality jobs", "I2V", "Assurance workflow", "Priority queue"],
    },
    {
        "key": "studio",
        "name": "Studio",
        "price_npr": 7999,
        "credits": 1400,
        "max_video_seconds": 20,
        "max_jobs_per_month": None,
        "features": ["Premium workflows", "Longer videos", "Revision memory", "Admin QA"],
    },
]

BASE_CREDITS = {
    TaskType.fast_preview: 8,
    TaskType.text_to_video_quality: 35,
    TaskType.image_to_video: 45,
    TaskType.premium_quality: 75,
    TaskType.video_upscale: 25,
}

GPU_SECONDS_PER_VIDEO_SECOND = {
    TaskType.fast_preview: 6,
    TaskType.text_to_video_quality: 18,
    TaskType.image_to_video: 22,
    TaskType.premium_quality: 35,
    TaskType.video_upscale: 10,
}


def seed_default_plans(db: Session) -> None:
    for plan in DEFAULT_PLANS:
        existing = db.execute(select(PricingPlan).where(PricingPlan.key == plan["key"])).scalars().first()
        if existing:
            continue
        db.add(PricingPlan(**plan))
    db.commit()


def seed_test_coupons(db: Session) -> None:
    """Create test coupons for QA and demo purposes."""
    test_coupons = [
        {
            "code": "FREE50",
            "description": "Free 50 credits - full free coupon",
            "credit_amount": 50,
            "percent_bonus": 0,
            "max_redemptions": None,
            "expires_at": None,
            "is_active": True,
        },
        {
            "code": "DISCOUNT25",
            "description": "25% bonus on any purchase (discount coupon)",
            "credit_amount": 0,
            "percent_bonus": 25,
            "max_redemptions": None,
            "expires_at": None,
            "is_active": True,
        },
        {
            "code": "STARTUP100",
            "description": "Startup package: 100 free credits",
            "credit_amount": 100,
            "percent_bonus": 0,
            "max_redemptions": 100,
            "expires_at": None,
            "is_active": True,
        },
        {
            "code": "BONUS50",
            "description": "Purchase bonus: Get 50% extra credits",
            "credit_amount": 0,
            "percent_bonus": 50,
            "max_redemptions": None,
            "expires_at": None,
            "is_active": True,
        },
        {
            "code": "PROMO10",
            "description": "Promotional coupon: 10 free credits + 10% bonus",
            "credit_amount": 10,
            "percent_bonus": 10,
            "max_redemptions": 500,
            "expires_at": None,
            "is_active": True,
        },
        {
            "code": "CHINA_SELLER",
            "description": "Special coupon for Chinese seller test: 200 free credits",
            "credit_amount": 200,
            "percent_bonus": 0,
            "max_redemptions": 5,
            "expires_at": None,
            "is_active": True,
        },
    ]
    
    for coupon_data in test_coupons:
        existing = db.execute(select(Coupon).where(Coupon.code == coupon_data["code"])).scalars().first()
        if existing:
            continue
        coupon = Coupon(**coupon_data)
        db.add(coupon)
    db.commit()


def get_wallet(db: Session, user_id: str, create: bool = True) -> CreditWallet | None:
    wallet = db.execute(select(CreditWallet).where(CreditWallet.user_id == user_id)).scalars().first()
    if not wallet and create:
        wallet = CreditWallet(user_id=user_id, balance=0, lifetime_credits=0, lifetime_spent=0)
        db.add(wallet)
        db.commit()
        db.refresh(wallet)
    return wallet


def _locked_wallet(db: Session, user_id: str) -> CreditWallet:
    wallet = db.execute(select(CreditWallet).where(CreditWallet.user_id == user_id).with_for_update()).scalars().first()
    if not wallet:
        wallet = CreditWallet(user_id=user_id, balance=0, lifetime_credits=0, lifetime_spent=0)
        db.add(wallet)
        db.flush()
    return wallet


def estimate_generation_cost(task_type: TaskType, *, duration_seconds: int = 6, quality: str = "standard", complexity_score: int | None = None, model_key: str | None = None) -> dict:
    duration_seconds = max(1, min(duration_seconds, 60))
    complexity_score = complexity_score or 4
    base = BASE_CREDITS[task_type]
    duration_factor = max(1, duration_seconds / 6)
    complexity_factor = 1 if complexity_score <= 4 else 1.2 if complexity_score <= 6 else 1.6
    quality_factor = {"preview": 0.6, "standard": 1.0, "premium": 1.45}.get(quality, 1.0)
    if model_key and "hunyuan" in model_key:
        quality_factor = max(quality_factor, 1.45)
    required = ceil(base * duration_factor * complexity_factor * quality_factor)
    gpu_seconds = ceil(GPU_SECONDS_PER_VIDEO_SECOND[task_type] * duration_seconds * complexity_factor)
    return {
        "required_credits": required,
        "estimated_gpu_seconds": gpu_seconds,
        "price_breakdown": {
            "base_credits": base,
            "duration_seconds": duration_seconds,
            "duration_factor": duration_factor,
            "complexity_score": complexity_score,
            "complexity_factor": complexity_factor,
            "quality_factor": quality_factor,
            "model_key": model_key,
            "note": "Credits are internal Saar credits. Keep GPU price assumptions configurable because RunPod charges per second and pricing changes.",
        },
    }


def _require_positive_amount(amount: int, label: str = "amount") -> None:
    if not isinstance(amount, int) or amount <= 0:
        raise ValueError(f"{label} must be a positive integer")


def add_credits(db: Session, *, user_id: str, amount: int, reason: str, ledger_type: LedgerType = LedgerType.grant, meta: dict | None = None) -> CreditWallet:
    _require_positive_amount(amount)
    wallet = _locked_wallet(db, user_id)
    wallet.balance += amount
    wallet.lifetime_credits += max(amount, 0)
    wallet.updated_at = datetime.utcnow()
    db.add(CreditLedger(user_id=user_id, type=ledger_type, amount=amount, balance_after=wallet.balance, reason=reason, meta=meta or {}))
    db.commit()
    db.refresh(wallet)
    return wallet


def debit_credits(db: Session, *, user_id: str, amount: int, job_id: str | None = None, reason: str, meta: dict | None = None) -> CreditWallet:
    _require_positive_amount(amount)
    wallet = _locked_wallet(db, user_id)
    if wallet.balance < amount:
        raise ValueError(f"Insufficient credits: required {amount}, available {wallet.balance}")
    wallet.balance -= amount
    wallet.lifetime_spent += amount
    wallet.updated_at = datetime.utcnow()
    db.add(CreditLedger(user_id=user_id, job_id=job_id, type=LedgerType.debit, amount=-amount, balance_after=wallet.balance, reason=reason, meta=meta or {}))
    db.commit()
    db.refresh(wallet)
    return wallet


def refund_credits(db: Session, *, user_id: str, amount: int, job_id: str, reason: str) -> CreditWallet:
    _require_positive_amount(amount)
    wallet = _locked_wallet(db, user_id)
    wallet.balance += amount
    wallet.lifetime_spent = max(0, wallet.lifetime_spent - amount)
    wallet.updated_at = datetime.utcnow()
    db.add(CreditLedger(user_id=user_id, job_id=job_id, type=LedgerType.refund, amount=amount, balance_after=wallet.balance, reason=reason))
    db.commit()
    db.refresh(wallet)
    return wallet


def redeem_coupon(db: Session, *, user_id: str, code: str, purchase_credits: int = 0) -> CreditWallet:
    if purchase_credits < 0:
        raise ValueError("purchase_credits cannot be negative")
    coupon = db.execute(select(Coupon).where(Coupon.code == code.strip().upper()).with_for_update()).scalars().first()
    if not coupon or not coupon.is_active:
        raise ValueError("Invalid coupon")
    existing_redemption = db.execute(select(CouponRedemption).where(CouponRedemption.coupon_id == coupon.id, CouponRedemption.user_id == user_id)).scalars().first()
    if existing_redemption:
        raise ValueError("Coupon already redeemed by this user")
    if coupon.expires_at and coupon.expires_at < datetime.utcnow():
        raise ValueError("Coupon expired")
    if coupon.max_redemptions is not None and coupon.redeemed_count >= coupon.max_redemptions:
        raise ValueError("Coupon redemption limit reached")
    bonus = ceil(purchase_credits * (coupon.percent_bonus / 100)) if coupon.percent_bonus else 0
    amount = coupon.credit_amount + bonus
    if amount <= 0:
        raise ValueError("Coupon has no credit value")
    coupon.redeemed_count += 1
    wallet = _locked_wallet(db, user_id)
    wallet.balance += amount
    wallet.lifetime_credits += amount
    wallet.updated_at = datetime.utcnow()
    db.add(CouponRedemption(coupon_id=coupon.id, user_id=user_id, credit_amount=amount, purchase_credits=purchase_credits))
    db.add(CreditLedger(user_id=user_id, type=LedgerType.coupon, amount=amount, balance_after=wallet.balance, reason=f"coupon {coupon.code}", meta={"coupon_id": coupon.id, "purchase_credits": purchase_credits}))
    db.commit()
    db.refresh(wallet)
    return wallet
