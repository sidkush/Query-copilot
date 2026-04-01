"""Regression test for QueryCopilot API — chat history, auth, tutorial."""
import requests
import json
import time

BASE = "http://127.0.0.1:8000/api"
PASS = 0
FAIL = 0
results = []


def test(name, condition, detail=""):
    global PASS, FAIL
    if condition:
        PASS += 1
        results.append(f"  PASS: {name}")
    else:
        FAIL += 1
        results.append(f"  FAIL: {name} -- {detail}")


def get_otp_from_log(identifier, channel):
    """Read OTP from the dev log file."""
    time.sleep(0.3)
    with open(".data/sent_otps.log", "r") as f:
        lines = f.readlines()
    for line in reversed(lines):
        if identifier in line and channel in line:
            return line.split("OTP: ")[1].split(" |")[0].strip()
    return None


# ============================================================
# 1. AUTH REGRESSION
# ============================================================
print("=== 1. AUTH TESTS ===")

# 1a. Register new user (with full OTP verification flow)
# Use a unique email each run to avoid "user already exists"
import random
reg_suffix = random.randint(10000, 99999)
reg_email = f"regtest_{reg_suffix}@test.com"
reg_phone = f"555{reg_suffix}"

# Verify email OTP only (phone is optional now — either email OR phone is enough)
requests.post(f"{BASE}/auth/send-email-otp", json={"email": reg_email})
otp = get_otp_from_log(reg_email, "email")
requests.post(f"{BASE}/auth/verify-email-otp", json={"email": reg_email, "code": otp})

# Register
r = requests.post(f"{BASE}/auth/register", json={
    "email": reg_email,
    "password": "Password123!",
    "confirm_password": "Password123!",
    "name": "Regress Tester",
    "phone": reg_phone,
    "country_code": "+1",
})
data = r.json()
test("Register returns token", r.status_code == 200 and "access_token" in data, str(data)[:200])
test("Register returns is_new=True", data.get("user", {}).get("is_new") is True, str(data.get("user")))
test("Register returns tutorial_completed=False", data.get("user", {}).get("tutorial_completed") is False, str(data.get("user")))

# 1b. Login
r = requests.post(f"{BASE}/auth/login", json={
    "email": "debugtest@querycopilot.com",
    "password": "TestPass123!",
})
data = r.json()
test("Login succeeds", r.status_code == 200)
test("Login returns tutorial_completed", "tutorial_completed" in data.get("user", {}), str(data.get("user")))
token = data.get("access_token")
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

# 1c. Tutorial complete endpoint
r = requests.post(f"{BASE}/auth/tutorial-complete", headers=headers)
test("Tutorial-complete endpoint", r.status_code == 200 and r.json().get("tutorial_completed") is True)

# 1d. Login again - tutorial should persist
r = requests.post(f"{BASE}/auth/login", json={
    "email": "debugtest@querycopilot.com",
    "password": "TestPass123!",
})
test("Tutorial persists after re-login", r.json()["user"].get("tutorial_completed") is True)

# 1e. Auth me
r = requests.get(f"{BASE}/auth/me", headers=headers)
test("GET /auth/me", r.status_code == 200 and r.json().get("email") == "debugtest@querycopilot.com")


# ============================================================
# 2. CHAT CRUD REGRESSION
# ============================================================
print("=== 2. CHAT CRUD TESTS ===")

# 2a. Create chat
r = requests.post(f"{BASE}/chats/", json={
    "title": "Regression Test Chat",
    "db_type": "postgresql",
    "database_name": "regdb",
}, headers=headers)
test("Create chat", r.status_code == 200 and "chat_id" in r.json())
reg_chat_id = r.json().get("chat_id")

# 2b. List chats
r = requests.get(f"{BASE}/chats/", headers=headers)
test("List chats", r.status_code == 200 and len(r.json().get("chats", [])) > 0)

# 2c. Append user message
r = requests.put(f"{BASE}/chats/{reg_chat_id}/messages", json={
    "type": "user", "content": "Test question?",
}, headers=headers)
test("Append user message", r.status_code == 200, r.text[:100])

# 2d. Append sql_preview message (with ALL fields)
r = requests.put(f"{BASE}/chats/{reg_chat_id}/messages", json={
    "type": "sql_preview",
    "question": "Test?",
    "sql": "SELECT 1",
    "rawSQL": "SELECT 1",
    "model": "claude-sonnet-4-20250514",
    "latency": 100.5,
    "connId": "conn1",
    "dbLabel": "regdb",
}, headers=headers)
test("Append sql_preview message", r.status_code == 200, r.text[:100])

# 2e. Append result message (with columns, rows, summary)
r = requests.put(f"{BASE}/chats/{reg_chat_id}/messages", json={
    "type": "result",
    "question": "Test?",
    "sql": "SELECT 1",
    "summary": "Result is 1",
    "columns": ["val"],
    "rows": [{"val": 1}],
    "rowCount": 1,
    "latency": 50,
    "dbLabel": "regdb",
    "connId": "conn1",
}, headers=headers)
test("Append result message", r.status_code == 200, r.text[:100])

# 2f. Append error message
r = requests.put(f"{BASE}/chats/{reg_chat_id}/messages", json={
    "type": "error", "content": "Test error",
}, headers=headers)
test("Append error message", r.status_code == 200, r.text[:100])

# 2g. Append system message
r = requests.put(f"{BASE}/chats/{reg_chat_id}/messages", json={
    "type": "system", "content": "Feedback recorded",
}, headers=headers)
test("Append system message", r.status_code == 200, r.text[:100])

# 2h. Load chat and verify ALL messages + fields roundtrip
r = requests.get(f"{BASE}/chats/{reg_chat_id}", headers=headers)
loaded = r.json()
msgs = loaded.get("messages", [])
test("Load chat - message count = 5", len(msgs) == 5, f"got {len(msgs)}")
test("Load chat - user msg", msgs[0].get("type") == "user" and msgs[0].get("content") == "Test question?")
test("Load chat - sql_preview fields preserved",
     msgs[1].get("type") == "sql_preview"
     and msgs[1].get("sql") == "SELECT 1"
     and msgs[1].get("model") == "claude-sonnet-4-20250514"
     and msgs[1].get("latency") == 100.5
     and msgs[1].get("connId") == "conn1")
test("Load chat - result fields preserved",
     msgs[2].get("type") == "result"
     and msgs[2].get("rows") == [{"val": 1}]
     and msgs[2].get("columns") == ["val"]
     and msgs[2].get("summary") == "Result is 1"
     and msgs[2].get("rowCount") == 1)
test("Load chat - error msg", msgs[3].get("type") == "error" and msgs[3].get("content") == "Test error")
test("Load chat - system msg", msgs[4].get("type") == "system" and msgs[4].get("content") == "Feedback recorded")

# 2i. Validation: message without type should fail
r = requests.put(f"{BASE}/chats/{reg_chat_id}/messages", json={"content": "no type"}, headers=headers)
test("Reject message without type (422)", r.status_code == 422)

# 2j. 404 for non-existent chat
r = requests.get(f"{BASE}/chats/nonexistent", headers=headers)
test("404 for non-existent chat", r.status_code == 404)

# 2k. Delete chat
r = requests.delete(f"{BASE}/chats/{reg_chat_id}", headers=headers)
test("Delete chat", r.status_code == 200)
r = requests.get(f"{BASE}/chats/{reg_chat_id}", headers=headers)
test("Deleted chat returns 404", r.status_code == 404)


# ============================================================
# 3. DEBUG CHATS STILL INTACT (must NOT be deleted)
# ============================================================
print("=== 3. DEBUG CHAT PERSISTENCE ===")
r = requests.get(f"{BASE}/chats/", headers=headers)
chats = r.json().get("chats", [])
debug_titles = [c["title"] for c in chats if "Debug Chat" in c.get("title", "")]
test("Debug Chat 1 exists", any("Chat 1" in t for t in debug_titles), str(debug_titles))
test("Debug Chat 2 exists", any("Chat 2" in t for t in debug_titles), str(debug_titles))

# Load debug chat 1 and verify messages
chat1 = next((c for c in chats if "Chat 1" in c.get("title", "")), None)
if chat1:
    r = requests.get(f"{BASE}/chats/{chat1['chat_id']}", headers=headers)
    msgs = r.json().get("messages", [])
    test("Debug Chat 1 has 3 messages", len(msgs) == 3, f"got {len(msgs)}")
    test("Debug Chat 1 user msg intact", msgs[0].get("content") == "How many users signed up this week?" if msgs else False)
    test("Debug Chat 1 result has rows", msgs[2].get("rows") == [{"count": 42}] if len(msgs) > 2 else False)

# Load debug chat 2 and verify
chat2 = next((c for c in chats if "Chat 2" in c.get("title", "")), None)
if chat2:
    r = requests.get(f"{BASE}/chats/{chat2['chat_id']}", headers=headers)
    msgs = r.json().get("messages", [])
    test("Debug Chat 2 has 5 messages", len(msgs) == 5, f"got {len(msgs)}")
    test("Debug Chat 2 error msg intact",
         msgs[4].get("type") == "error" and "timeout" in msgs[4].get("content", "").lower() if len(msgs) > 4 else False)


# ============================================================
# 4. SECURITY REGRESSION
# ============================================================
print("=== 4. SECURITY TESTS ===")

r = requests.get(f"{BASE}/chats/")
test("Chats require auth (401/403)", r.status_code in [401, 403])

r = requests.get(f"{BASE}/auth/me")
test("Auth/me requires auth (401/403)", r.status_code in [401, 403])

r = requests.post(f"{BASE}/chats/", json={"title": "<script>alert(1)</script>Real Title"}, headers=headers)
if r.status_code == 200:
    test("XSS stripped from title", "<script>" not in r.json().get("title", ""))
    requests.delete(f"{BASE}/chats/{r.json()['chat_id']}", headers=headers)


# ============================================================
# 5. HEALTH CHECK
# ============================================================
print("=== 5. HEALTH CHECK ===")
r = requests.get(f"{BASE}/health")
test("Health endpoint OK", r.status_code == 200)


# ============================================================
# SUMMARY
# ============================================================
print()
for line in results:
    print(line)
print(f"\n{'='*50}")
print(f"RESULTS: {PASS} passed, {FAIL} failed out of {PASS + FAIL}")
print(f"{'='*50}")
