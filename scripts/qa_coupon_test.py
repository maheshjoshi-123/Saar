import requests
import json

API_URL = "http://localhost:8000"
API_TOKEN = "dev-token"
ADMIN_TOKEN = "admin-token"

def test_coupons():
    print("Testing coupon system...")
    
    # 1. Create a coupon as admin
    coupon_code = "QA-TEST-COUPON"
    admin_headers = {
        "Authorization": f"Bearer {ADMIN_TOKEN}",
        "Content-Type": "application/json"
    }
    payload = {
        "code": coupon_code,
        "description": "QA Stress Test Coupon",
        "credit_amount": 500,
        "percent_bonus": 10,
        "max_redemptions": 10,
        "is_active": True
    }
    
    response = requests.post(f"{API_URL}/api/admin/coupons", headers=admin_headers, json=payload)
    if response.status_code != 200:
        print(f"Failed to create coupon: {response.text}")
        return
    print(f"Coupon {coupon_code} created successfully.")

    # 2. Create a user
    user_payload = {"user_id": "coupon-user", "name": "Coupon User", "mode": "signup"}
    headers = {"Authorization": f"Bearer {API_TOKEN}", "Content-Type": "application/json"}
    user_resp = requests.post(f"{API_URL}/api/auth/demo", headers=headers, json=user_payload)
    user_session = user_resp.json()
    print(f"User created: {user_session['user_id']}")

    # 3. Redeem coupon
    redeem_payload = {
        "user_id": user_session["user_id"],
        "code": coupon_code,
        "purchase_credits": 0
    }
    user_headers = {
        "Authorization": f"Bearer {API_TOKEN}",
        "x-saar-user-id": user_session["user_id"],
        "x-saar-user-token": user_session["token"],
        "Content-Type": "application/json"
    }
    
    redeem_resp = requests.post(f"{API_URL}/api/coupons/redeem", headers=user_headers, json=redeem_payload)
    if redeem_resp.status_code == 200:
        wallet = redeem_resp.json()
        print(f"Coupon redeemed successfully. New balance: {wallet['balance']}")
    else:
        print(f"Failed to redeem coupon: {redeem_resp.text}")

if __name__ == "__main__":
    test_coupons()
