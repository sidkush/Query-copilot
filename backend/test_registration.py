"""End-to-end test of the new registration flow with OTP verification."""
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
# 1. EMAIL OTP FLOW
# ============================================================
print("=== 1. EMAIL OTP ===")
email = "regflow_test@querycopilot.com"

r = requests.post(f"{BASE}/auth/send-email-otp", json={"email": email})
test("Send email OTP", r.status_code == 200 and r.json().get("success"), r.text)

email_otp = get_otp_from_log(email, "email")
test("OTP logged for debugging", email_otp is not None and len(email_otp) == 6, f"otp={email_otp}")

# Wrong OTP
r = requests.post(f"{BASE}/auth/verify-email-otp", json={"email": email, "code": "000000"})
test("Wrong OTP rejected", r.json().get("verified") is False, r.text)
test("Shows remaining attempts", r.json().get("remaining_attempts", -1) >= 0, r.text)

# Correct OTP
r = requests.post(f"{BASE}/auth/verify-email-otp", json={"email": email, "code": email_otp})
test("Correct email OTP verified", r.json().get("verified") is True, r.text)

# ============================================================
# 2. PHONE OTP FLOW
# ============================================================
print("=== 2. PHONE OTP ===")
phone = "5559876543"
country_code = "+1"
full_phone = f"{country_code}{phone}"

r = requests.post(f"{BASE}/auth/send-phone-otp", json={"phone": phone, "country_code": country_code})
test("Send phone OTP", r.status_code == 200 and r.json().get("success"), r.text)

phone_otp = get_otp_from_log(full_phone, "phone")
test("Phone OTP logged", phone_otp is not None and len(phone_otp) == 6, f"otp={phone_otp}")

# Correct phone OTP
r = requests.post(f"{BASE}/auth/verify-phone-otp", json={
    "phone": phone, "country_code": country_code, "code": phone_otp,
})
test("Correct phone OTP verified", r.json().get("verified") is True, r.text)

# ============================================================
# 3. REGISTRATION (with verified OTPs)
# ============================================================
print("=== 3. REGISTRATION ===")

r = requests.post(f"{BASE}/auth/register", json={
    "email": email,
    "password": "SecurePass123!",
    "confirm_password": "SecurePass123!",
    "name": "Registration Flow Tester",
    "phone": phone,
    "country_code": country_code,
})
test("Registration succeeds", r.status_code == 200, r.text[:200])
data = r.json()
test("Returns access_token", "access_token" in data, str(data.keys()))
test("Returns user info", data.get("user", {}).get("email") == email)
test("User is_new=True", data.get("user", {}).get("is_new") is True)

# Login with new account
r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": "SecurePass123!"})
test("Login with new account", r.status_code == 200)

# ============================================================
# 4. VALIDATION CHECKS
# ============================================================
print("=== 4. VALIDATION ===")

# Unverified email
r = requests.post(f"{BASE}/auth/register", json={
    "email": "unverified@test.com",
    "password": "Pass12345!",
    "confirm_password": "Pass12345!",
    "name": "Unverified",
    "phone": "1234567890",
    "country_code": "+1",
})
test("Reject unverified email", r.status_code == 400, r.text[:100])

# Password mismatch
r = requests.post(f"{BASE}/auth/send-email-otp", json={"email": "pwmismatch@test.com"})
otp = get_otp_from_log("pwmismatch@test.com", "email")
requests.post(f"{BASE}/auth/verify-email-otp", json={"email": "pwmismatch@test.com", "code": otp})
r = requests.post(f"{BASE}/auth/send-phone-otp", json={"phone": "1112223333", "country_code": "+1"})
otp2 = get_otp_from_log("+11112223333", "phone")
requests.post(f"{BASE}/auth/verify-phone-otp", json={
    "phone": "1112223333", "country_code": "+1", "code": otp2,
})
r = requests.post(f"{BASE}/auth/register", json={
    "email": "pwmismatch@test.com",
    "password": "Password1!",
    "confirm_password": "DifferentPw!",
    "name": "PW Mismatch",
    "phone": "1112223333",
    "country_code": "+1",
})
test("Reject password mismatch", r.status_code == 400 and "match" in r.json().get("detail", "").lower(), r.text[:100])

# ============================================================
# 5. EXISTING FEATURES STILL WORK
# ============================================================
print("=== 5. REGRESSION ===")

# Login existing user
r = requests.post(f"{BASE}/auth/login", json={
    "email": "debugtest@querycopilot.com",
    "password": "TestPass123!",
})
test("Existing user login", r.status_code == 200)
token = r.json().get("access_token")
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

# Tutorial complete
r = requests.post(f"{BASE}/auth/tutorial-complete", headers=headers)
test("Tutorial complete endpoint", r.status_code == 200)

# Chat CRUD
r = requests.get(f"{BASE}/chats/", headers=headers)
test("List chats", r.status_code == 200)

# Health
r = requests.get(f"{BASE}/health")
test("Health check", r.status_code == 200)


# ============================================================
# SUMMARY
# ============================================================
print()
for line in results:
    print(line)
print(f"\n{'='*50}")
print(f"RESULTS: {PASS} passed, {FAIL} failed out of {PASS + FAIL}")
print(f"{'='*50}")
