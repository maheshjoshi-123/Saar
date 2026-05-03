import requests
import json
import time
import concurrent.futures
import uuid

API_URL = "http://localhost:8000"
API_TOKEN = "dev-token"

def create_user(user_id, name):
    headers = {
        "Authorization": f"Bearer {API_TOKEN}",
        "Content-Type": "application/json"
    }
    payload = {
        "user_id": user_id,
        "name": name,
        "mode": "signup"
    }
    response = requests.post(f"{API_URL}/api/auth/demo", headers=headers, json=payload)
    if response.status_code == 200:
        print(f"User {user_id} created successfully.")
        return response.json()
    else:
        print(f"Failed to create user {user_id}: {response.text}")
        return None

def generate_packet(user_session, prompt):
    headers = {
        "Authorization": f"Bearer {API_TOKEN}",
        "x-saar-user-id": user_session["user_id"],
        "x-saar-user-token": user_session["token"],
        "Content-Type": "application/json"
    }
    payload = {
        "route": "generate_plan",
        "raw_prompt": prompt,
        "user_id": user_session["user_id"],
        "settings": {
            "duration_seconds": 6,
            "platform": "instagram_reels",
            "style": "Cinematic",
            "pace": "Medium",
            "realism": "Photorealistic",
            "audience": "Gen Z",
            "hero_subject": "A futuristic car",
            "location": "Tokyo at night"
        },
        "charge_credits": True
    }
    start_time = time.time()
    response = requests.post(f"{API_URL}/api/intelligence/packet", headers=headers, json=payload)
    end_time = time.time()
    if response.status_code == 200:
        print(f"Packet generated for {user_session['user_id']} in {end_time - start_time:.2f}s")
        return response.json()
    else:
        print(f"Failed to generate packet for {user_session['user_id']}: {response.text}")
        return None

def stress_test():
    print("Starting stress test...")
    users = []
    for i in range(10):
        user_id = f"stress-user-{uuid.uuid4().hex[:8]}"
        user = create_user(user_id, f"Stress User {i}")
        if user:
            users.append(user)

    print(f"Successfully created {len(users)} users. Starting concurrent packet generation...")
    
    prompts = [
        "A cool drone shot over a mountain",
        "A close up of a luxury watch",
        "A fast paced sports car race",
        "A peaceful garden with a fountain",
        "A futuristic robot cooking a meal",
        "A cyberpunk city street with rain",
        "A medieval knight in a forest",
        "A cute kitten playing with yarn",
        "A space station orbiting a planet",
        "A surfer riding a huge wave"
    ]

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(generate_packet, users[i], prompts[i]) for i in range(len(users))]
        concurrent.futures.wait(futures)

    print("Stress test complete.")

if __name__ == "__main__":
    stress_test()
