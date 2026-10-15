"""Minimal full-stack starter: replace the example dashboard with your product."""

import hashlib
import hmac
import html
import re
import secrets

from fastapi import FastAPI, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from google.api_core.exceptions import AlreadyExists

from sandbox_auth import clear_session, current_user, set_session, signer
from sandbox_db import collection, env


app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
EMAIL = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def users():
    return collection("users")


def password_hash(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 600_000)
    return f"pbkdf2_sha256$600000${salt.hex()}${digest.hex()}"


def password_matches(password: str, stored: str) -> bool:
    try:
        algorithm, rounds, salt, expected = stored.split("$")
        if algorithm != "pbkdf2_sha256" or int(rounds) != 600_000:
            return False
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(rounds))
        return hmac.compare_digest(actual, bytes.fromhex(expected))
    except (TypeError, ValueError):
        return False


def user_id(email: str) -> str:
    return hashlib.sha256(email.encode()).hexdigest()


def csrf_token() -> str:
    return signer("starter.csrf").sign(secrets.token_hex(16).encode()).decode()


def csrf_valid(request: Request, submitted: str) -> bool:
    from itsdangerous import BadSignature

    cookie = request.cookies.get("starter_csrf", "")
    if not cookie or not hmac.compare_digest(cookie, submitted):
        return False
    try:
        signer("starter.csrf").unsign(cookie, max_age=3600)
        return True
    except BadSignature:
        return False


def page(title: str, body: str) -> HTMLResponse:
    return HTMLResponse(f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)} · Your app</title><link rel="stylesheet" href="/static/style.css">
</head><body><header><a href="/" class="brand">Your app</a></header>
<main>{body}</main><footer>Built with AIT Foundry</footer></body></html>""")


def form_page(title: str, action: str, error: str = "") -> HTMLResponse:
    token = csrf_token()
    error_html = f'<p class="error" role="alert">{html.escape(error)}</p>' if error else ""
    other = ('<a href="/signin">Already have an account? Sign in</a>' if action == "signup"
             else '<a href="/signup">Create an account</a>')
    body = f"""<section class="card"><h1>{html.escape(title)}</h1>{error_html}
<form method="post" action="/{action}"><input type="hidden" name="csrf" value="{token}">
<label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required>
<label for="password">Password</label><input id="password" name="password" type="password"
 autocomplete="{'new-password' if action == 'signup' else 'current-password'}" required minlength="12">
<button type="submit">{html.escape(title)}</button></form><p class="secondary">{other}</p></section>"""
    response = page(title, body)
    response.set_cookie("starter_csrf", token, max_age=3600, httponly=True,
                        secure=env() == "prod", samesite="lax", path="/")
    return response


@app.get("/")
def home(request: Request):
    return RedirectResponse("/dashboard" if current_user(request) else "/signin", status_code=303)


@app.get("/signup")
def signup_page(request: Request):
    if current_user(request):
        return RedirectResponse("/dashboard", status_code=303)
    return form_page("Create account", "signup")


@app.post("/signup")
def signup(request: Request, email: str = Form(...), password: str = Form(...), csrf: str = Form(...)):
    if not csrf_valid(request, csrf):
        return form_page("Create account", "signup", "Form expired. Please try again.")
    email = email.strip().lower()
    if len(email) > 254 or not EMAIL.fullmatch(email) or len(password) < 12 or len(password) > 1024:
        return form_page("Create account", "signup", "Enter a valid email and a password of at least 12 characters.")
    uid = user_id(email)
    try:
        users().document(uid).create({"email": email, "password_hash": password_hash(password)})
    except AlreadyExists:
        return form_page("Create account", "signup", "This email is already registered. Try signing in.")
    response = RedirectResponse("/dashboard", status_code=303)
    set_session(response, uid)
    return response


@app.get("/signin")
def signin_page(request: Request):
    if current_user(request):
        return RedirectResponse("/dashboard", status_code=303)
    return form_page("Sign in", "signin")


@app.post("/signin")
def signin(request: Request, email: str = Form(...), password: str = Form(...), csrf: str = Form(...)):
    if not csrf_valid(request, csrf):
        return form_page("Sign in", "signin", "Form expired. Please try again.")
    email = email.strip().lower()
    if len(password) > 1024:
        return form_page("Sign in", "signin", "Email or password is incorrect.")
    doc = users().document(user_id(email)).get() if len(email) <= 254 else None
    data = doc.to_dict() if doc and doc.exists else {}
    if not password_matches(password, data.get("password_hash", "")):
        return form_page("Sign in", "signin", "Email or password is incorrect.")
    response = RedirectResponse("/dashboard", status_code=303)
    set_session(response, doc.id)
    return response


@app.get("/dashboard")
def dashboard(request: Request):
    doc = current_user(request)
    if not doc:
        return RedirectResponse("/signin", status_code=303)
    token = csrf_token()
    email = html.escape(doc.to_dict().get("email", ""))
    response = page("Dashboard", f"""<section class="card"><h1>Your dashboard</h1>
<p>Signed in as {email}.</p><p>Replace this area with your application.</p>
<form method="post" action="/signout"><input type="hidden" name="csrf" value="{token}">
<button type="submit" class="secondary-button">Sign out</button></form></section>""")
    response.set_cookie("starter_csrf", token, max_age=3600, httponly=True,
                        secure=env() == "prod", samesite="lax", path="/")
    return response


@app.post("/signout")
def signout(request: Request, csrf: str = Form(...)):
    if not csrf_valid(request, csrf):
        return RedirectResponse("/dashboard", status_code=303)
    response = RedirectResponse("/signin", status_code=303)
    clear_session(response)
    response.delete_cookie("starter_csrf", path="/")
    return response
