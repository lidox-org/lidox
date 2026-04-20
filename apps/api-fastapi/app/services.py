import hashlib
import json
import re
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
from uuid import uuid4

import bcrypt
import httpx
import jwt
from fastapi import HTTPException, status

from app.config import Settings, get_settings
from app.db import execute, fetch_all, fetch_one
from app.http import api_error
from app.pdf_export import build_pdf_document
from app.redis_client import get_redis
from app.security import AuthContext


ROLE_HIERARCHY = {
    "owner": 4,
    "editor": 3,
    "commenter": 2,
    "viewer": 1,
}
GOOGLE_OAUTH_STATE_AUDIENCE = "google-oauth-state"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
PERMISSION_EVENT_CHANNEL = "permissions:changed"


def to_camel_row(row: dict) -> dict:
    renamed = {
        "owner_id": "ownerId",
        "ai_enabled": "aiEnabled",
        "created_at": "createdAt",
        "updated_at": "updatedAt",
        "deleted_at": "deletedAt",
        "document_id": "documentId",
        "crdt_clock": "crdtClock",
        "created_by": "createdBy",
        "snapshot_url": "snapshotUrl",
        "preview_text": "previewText",
        "user_id": "userId",
        "link_token": "linkToken",
        "avatar_url": "avatarUrl",
    }
    return {renamed.get(key, key): value for key, value in row.items()}


def serialize_user(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "email": row["email"],
        "name": row["name"],
        "avatarUrl": row.get("avatar_url"),
    }


def duration_to_seconds(duration: str) -> int:
    multipliers = {
        "ms": 0.001,
        "s": 1,
        "m": 60,
        "h": 3600,
        "d": 86400,
    }
    digits = "".join(ch for ch in duration if ch.isdigit())
    suffix = duration[len(digits) :] or "ms"
    if not digits:
        return 900
    return int(int(digits) * multipliers.get(suffix, 60))


def sanitize_filename(value: str) -> str:
    sanitized = re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-._")
    return sanitized or "lidox-document"


async def publish_permission_change_event(
    doc_id: str,
    user_id: str,
    new_role: str | None,
) -> None:
    payload = json.dumps(
        {
            "documentId": doc_id,
            "userId": user_id,
            "newRole": new_role,
        }
    )
    try:
        await get_redis().publish(PERMISSION_EVENT_CHANNEL, payload)
    except Exception:
        # Permission changes still apply even if the live disconnect fan-out fails.
        pass


class AuthService:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()

    async def register(self, email: str, password: str, name: str) -> dict:
        existing = await fetch_one(
            "SELECT id FROM users WHERE email = %s LIMIT 1",
            (email,),
        )
        if existing:
            raise api_error(status.HTTP_409_CONFLICT, "Email already registered")

        org = await fetch_one(
            """
            INSERT INTO organizations (name)
            VALUES (%s)
            RETURNING id, name
            """,
            (f"{name}'s Org",),
        )

        password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode(
            "utf-8"
        )
        user = await fetch_one(
            """
            INSERT INTO users (email, password_hash, name, org_id)
            VALUES (%s, %s, %s, %s)
            RETURNING id, email, name, avatar_url
            """,
            (email, password_hash, name, org["id"]),
        )
        tokens = await self.issue_tokens(user["id"], user["email"])
        return {"user": serialize_user(user), **tokens}

    async def login(self, email: str, password: str) -> dict:
        user = await fetch_one(
            """
            SELECT id, email, password_hash, name, avatar_url
            FROM users
            WHERE email = %s
            LIMIT 1
            """,
            (email,),
        )
        if not user or not user.get("password_hash"):
            raise api_error(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")

        valid = bcrypt.checkpw(
            password.encode("utf-8"),
            user["password_hash"].encode("utf-8"),
        )
        if not valid:
            raise api_error(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")

        tokens = await self.issue_tokens(user["id"], user["email"])
        return {"user": serialize_user(user), **tokens}

    def google_oauth_enabled(self) -> bool:
        return self.settings.google_oauth_enabled

    def create_google_oauth_state_token(self, nonce: str) -> str:
        issued_at = datetime.now(timezone.utc)
        return jwt.encode(
            {
                "aud": GOOGLE_OAUTH_STATE_AUDIENCE,
                "nonce": nonce,
                "iat": int(issued_at.timestamp()),
                "exp": int((issued_at + timedelta(minutes=10)).timestamp()),
            },
            self.settings.jwt_secret,
            algorithm=self.settings.jwt_algorithm,
        )

    def build_google_auth_url(self, state_token: str) -> str:
        if not self.google_oauth_enabled():
            raise api_error(status.HTTP_503_SERVICE_UNAVAILABLE, "Google sign-in is not configured")

        query = urlencode(
            {
                "client_id": self.settings.google_client_id,
                "redirect_uri": self.settings.resolved_google_oauth_redirect_uri,
                "response_type": "code",
                "scope": "openid email profile",
                "state": state_token,
                "prompt": "select_account",
            }
        )
        return f"https://accounts.google.com/o/oauth2/v2/auth?{query}"

    def verify_google_oauth_state(self, state_token: str, expected_nonce: str) -> None:
        try:
            payload = jwt.decode(
                state_token,
                self.settings.jwt_secret,
                algorithms=[self.settings.jwt_algorithm],
                audience=GOOGLE_OAUTH_STATE_AUDIENCE,
            )
        except jwt.PyJWTError as exc:
            raise api_error(status.HTTP_400_BAD_REQUEST, "Invalid Google OAuth state") from exc

        if payload.get("nonce") != expected_nonce:
            raise api_error(status.HTTP_400_BAD_REQUEST, "Google OAuth state did not match")

    async def login_with_google_code(self, code: str) -> dict:
        if not self.google_oauth_enabled():
            raise api_error(status.HTTP_503_SERVICE_UNAVAILABLE, "Google sign-in is not configured")

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                token_response = await client.post(
                    GOOGLE_TOKEN_URL,
                    data={
                        "code": code,
                        "client_id": self.settings.google_client_id,
                        "client_secret": self.settings.google_client_secret,
                        "redirect_uri": self.settings.resolved_google_oauth_redirect_uri,
                        "grant_type": "authorization_code",
                    },
                    headers={"Accept": "application/json"},
                )
                token_response.raise_for_status()
                token_payload = token_response.json()

                access_token = token_payload.get("access_token")
                if not access_token:
                    raise api_error(status.HTTP_401_UNAUTHORIZED, "Google did not return an access token")

                profile_response = await client.get(
                    GOOGLE_USERINFO_URL,
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                profile_response.raise_for_status()
                profile = profile_response.json()
        except HTTPException:
            raise
        except httpx.HTTPError as exc:
            raise api_error(status.HTTP_502_BAD_GATEWAY, "Google sign-in failed upstream") from exc

        email = str(profile.get("email") or "").strip().lower()
        if not email:
            raise api_error(status.HTTP_401_UNAUTHORIZED, "Google account did not provide an email")

        if profile.get("email_verified") is False:
            raise api_error(status.HTTP_401_UNAUTHORIZED, "Google account email is not verified")

        user = await self.find_or_create_google_user(
            email=email,
            name=str(profile.get("name") or "").strip(),
            avatar_url=str(profile.get("picture") or "").strip() or None,
        )
        tokens = await self.issue_tokens(user["id"], user["email"])
        return {"user": serialize_user(user), **tokens}

    async def refresh(self, raw_token: str) -> dict:
        token_hash = self.hash_token(raw_token)
        stored = await fetch_one(
            """
            SELECT id, user_id, family_id, expires_at, used
            FROM refresh_tokens
            WHERE token_hash = %s
            LIMIT 1
            """,
            (token_hash,),
        )
        if not stored:
            raise api_error(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")

        if datetime.now(timezone.utc) > stored["expires_at"]:
            raise api_error(status.HTTP_401_UNAUTHORIZED, "Refresh token expired")

        if stored["used"]:
            await execute(
                "DELETE FROM refresh_tokens WHERE family_id = %s",
                (stored["family_id"],),
            )
            raise api_error(status.HTTP_401_UNAUTHORIZED, "Refresh token reuse detected")

        await execute(
            "UPDATE refresh_tokens SET used = TRUE WHERE id = %s",
            (stored["id"],),
        )
        user = await fetch_one(
            """
            SELECT id, email, name, avatar_url
            FROM users
            WHERE id = %s
            LIMIT 1
            """,
            (stored["user_id"],),
        )
        if not user:
            raise api_error(status.HTTP_401_UNAUTHORIZED, "User not found")

        tokens = await self.issue_tokens(user["id"], user["email"], stored["family_id"])
        return {"user": serialize_user(user), **tokens}

    async def change_password(
        self,
        user_id: str,
        current_password: str,
        new_password: str,
    ) -> None:
        user = await fetch_one(
            """
            SELECT id, password_hash
            FROM users
            WHERE id = %s
            LIMIT 1
            """,
            (user_id,),
        )
        if not user or not user.get("password_hash"):
            raise api_error(status.HTTP_401_UNAUTHORIZED, "User not found")

        valid = bcrypt.checkpw(
            current_password.encode("utf-8"),
            user["password_hash"].encode("utf-8"),
        )
        if not valid:
            raise api_error(
                status.HTTP_401_UNAUTHORIZED,
                "Current password is incorrect",
            )

        new_hash = bcrypt.hashpw(
            new_password.encode("utf-8"),
            bcrypt.gensalt(rounds=12),
        ).decode("utf-8")
        await execute(
            "UPDATE users SET password_hash = %s WHERE id = %s",
            (new_hash, user_id),
        )

    async def get_me(self, user_id: str) -> dict:
        user = await fetch_one(
            """
            SELECT id, email, name, avatar_url
            FROM users
            WHERE id = %s
            LIMIT 1
            """,
            (user_id,),
        )
        if not user:
            raise api_error(status.HTTP_401_UNAUTHORIZED, "User not found")
        return serialize_user(user)

    async def find_or_create_google_user(
        self,
        *,
        email: str,
        name: str,
        avatar_url: str | None,
    ) -> dict:
        display_name = name or email.split("@", 1)[0]
        existing = await fetch_one(
            """
            SELECT id, email, name, avatar_url
            FROM users
            WHERE email = %s
            LIMIT 1
            """,
            (email,),
        )
        if existing:
            should_update_avatar = avatar_url and avatar_url != existing.get("avatar_url")
            if should_update_avatar:
                updated = await fetch_one(
                    """
                    UPDATE users
                    SET avatar_url = %s
                    WHERE id = %s
                    RETURNING id, email, name, avatar_url
                    """,
                    (avatar_url, existing["id"]),
                )
                if updated:
                    return updated
            return existing

        org = await fetch_one(
            """
            INSERT INTO organizations (name)
            VALUES (%s)
            RETURNING id
            """,
            (f"{display_name}'s Org",),
        )
        user = await fetch_one(
            """
            INSERT INTO users (email, password_hash, name, avatar_url, org_id)
            VALUES (%s, NULL, %s, %s, %s)
            RETURNING id, email, name, avatar_url
            """,
            (email, display_name, avatar_url, org["id"]),
        )
        return user

    async def update_me(self, user_id: str, name: str) -> dict:
        user = await fetch_one(
            """
            UPDATE users
            SET name = %s
            WHERE id = %s
            RETURNING id, email, name, avatar_url
            """,
            (name.strip(), user_id),
        )
        if not user:
            raise api_error(status.HTTP_401_UNAUTHORIZED, "User not found")
        return serialize_user(user)

    async def deny_jti(self, jti: str, ttl_seconds: int | None = None) -> None:
        ttl = ttl_seconds or duration_to_seconds(self.settings.jwt_expiration)
        redis = get_redis()
        await redis.sadd("denied_jtis", jti)
        await redis.expire("denied_jtis", ttl)

    async def issue_tokens(
        self,
        user_id: str,
        email: str,
        family_id: str | None = None,
    ) -> dict:
        user_id = str(user_id)
        jti = str(uuid4())
        issued_at = datetime.now(timezone.utc)
        expires_in = duration_to_seconds(self.settings.jwt_expiration)
        access_token = jwt.encode(
            {
                "sub": user_id,
                "email": email,
                "jti": jti,
                "iat": int(issued_at.timestamp()),
                "exp": int((issued_at + timedelta(seconds=expires_in)).timestamp()),
            },
            self.settings.jwt_secret,
            algorithm=self.settings.jwt_algorithm,
        )

        raw_refresh_token = str(uuid4())
        token_hash = self.hash_token(raw_refresh_token)
        family = str(family_id) if family_id else str(uuid4())
        expires_at = issued_at + timedelta(days=self.settings.refresh_token_expiration_days)

        await execute(
            """
            INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at)
            VALUES (%s, %s, %s, %s)
            """,
            (user_id, token_hash, family, expires_at),
        )
        return {
            "accessToken": access_token,
            "refreshToken": raw_refresh_token,
        }

    @staticmethod
    def hash_token(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()


class DocumentsService:
    async def create(self, title: str, user_id: str) -> dict:
        document = await fetch_one(
            """
            INSERT INTO documents (title, owner_id)
            VALUES (%s, %s)
            RETURNING id, title, owner_id, ai_enabled, created_at, updated_at, deleted_at
            """,
            (title or "Untitled Document", user_id),
        )
        await execute(
            """
            INSERT INTO permissions (document_id, user_id, role)
            VALUES (%s, %s, 'owner')
            """,
            (document["id"], user_id),
        )
        return to_camel_row(document)

    async def list_for_user(self, user_id: str) -> list[dict]:
        rows = await fetch_all(
            """
            SELECT d.id, d.title, d.owner_id, d.ai_enabled, d.created_at, d.updated_at,
                   d.deleted_at, p.role
            FROM permissions p
            INNER JOIN documents d ON p.document_id = d.id
            WHERE p.user_id = %s
              AND d.deleted_at IS NULL
            ORDER BY d.updated_at DESC
            """,
            (user_id,),
        )
        return [to_camel_row(row) for row in rows]

    async def get_by_id(self, doc_id: str, user_id: str) -> dict:
        document = await self.find_document(doc_id)
        role = await self.get_user_role(doc_id, user_id)
        if not role:
            raise api_error(status.HTTP_403_FORBIDDEN, "No access to this document")
        payload = to_camel_row(document)
        payload["role"] = role
        return payload

    async def update(self, doc_id: str, input_data: dict, user_id: str) -> dict:
        await self.find_document(doc_id)
        role = await self.get_user_role(doc_id, user_id)
        if not role:
            raise api_error(status.HTTP_403_FORBIDDEN, "No access to this document")

        if input_data.get("aiEnabled") is not None and ROLE_HIERARCHY[role] < ROLE_HIERARCHY["owner"]:
            raise api_error(status.HTTP_403_FORBIDDEN, "Only the owner can change AI settings")
        if input_data.get("title") is not None and ROLE_HIERARCHY[role] < ROLE_HIERARCHY["editor"]:
            raise api_error(status.HTTP_403_FORBIDDEN, "You need editor access to change the title")

        updated = await fetch_one(
            """
            UPDATE documents
            SET title = COALESCE(%s, title),
                ai_enabled = COALESCE(%s, ai_enabled),
                updated_at = NOW()
            WHERE id = %s
            RETURNING id, title, owner_id, ai_enabled, created_at, updated_at, deleted_at
            """,
            (input_data.get("title"), input_data.get("aiEnabled"), doc_id),
        )
        return to_camel_row(updated)

    async def soft_delete(self, doc_id: str, user_id: str) -> None:
        await self.find_document(doc_id)
        role = await self.get_user_role(doc_id, user_id)
        if role != "owner":
            raise api_error(status.HTTP_403_FORBIDDEN, "Only the owner can delete this document")
        await execute(
            "UPDATE documents SET deleted_at = NOW() WHERE id = %s",
            (doc_id,),
        )

    async def export_pdf(self, doc_id: str, user_id: str, title: str | None, text: str) -> tuple[str, bytes]:
        document = await self.find_document(doc_id)
        role = await self.get_user_role(doc_id, user_id)
        if not role:
            raise api_error(status.HTTP_403_FORBIDDEN, "No access to this document")

        export_title = (title or "").strip() or document["title"]
        pdf_bytes = build_pdf_document(export_title, text)
        filename = f"{sanitize_filename(export_title)}.pdf"
        return filename, pdf_bytes

    async def list_versions(self, doc_id: str, user_id: str) -> list[dict]:
        role = await self.get_user_role(doc_id, user_id)
        if not role:
            raise api_error(status.HTTP_403_FORBIDDEN, "No access to this document")
        rows = await fetch_all(
            """
            WITH ordered_versions AS (
                SELECT
                    v.id,
                    v.document_id,
                    v.snapshot,
                    NULL::TEXT AS snapshot_url,
                    COALESCE(v.preview_text, '') AS preview_text,
                    COALESCE(u.name, u.email, v.created_by::TEXT) AS created_by,
                    v.created_at,
                    LAG(v.snapshot) OVER (ORDER BY v.created_at ASC, v.id ASC) AS previous_snapshot
                FROM document_versions v
                LEFT JOIN users u ON u.id = v.created_by
                WHERE v.document_id = %s
            ),
            visible_versions AS (
                SELECT
                    id,
                    document_id,
                    snapshot_url,
                    preview_text,
                    created_by,
                    created_at
                FROM ordered_versions
                WHERE previous_snapshot IS DISTINCT FROM snapshot
            ),
            numbered_versions AS (
                SELECT
                    id,
                    document_id,
                    snapshot_url,
                    ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS crdt_clock,
                    NULLIF(preview_text, '') AS preview_text,
                    created_by,
                    created_at
                FROM visible_versions
            )
            SELECT id, document_id, snapshot_url, crdt_clock, preview_text, created_by, created_at
            FROM numbered_versions
            ORDER BY created_at DESC, id DESC
            LIMIT 50
            """,
            (doc_id,),
        )
        return [to_camel_row(row) for row in rows]

    async def restore_version(self, doc_id: str, version_id: str, user_id: str) -> dict:
        role = await self.get_user_role(doc_id, user_id)
        if not role or ROLE_HIERARCHY[role] < ROLE_HIERARCHY["editor"]:
            raise api_error(
                status.HTTP_403_FORBIDDEN,
                "Editor access required to restore versions",
            )
        version = await fetch_one(
            """
            SELECT id, snapshot, crdt_clock, preview_text, snapshot_hash
            FROM document_versions
            WHERE id = %s AND document_id = %s
            LIMIT 1
            """,
            (version_id, doc_id),
        )
        if not version:
            raise api_error(status.HTTP_404_NOT_FOUND, "Version not found")
        if not version.get("snapshot"):
            raise api_error(
                status.HTTP_404_NOT_FOUND,
                "Version snapshot is empty — cannot restore",
            )

        await execute(
            """
            INSERT INTO document_versions (
                document_id,
                snapshot,
                crdt_clock,
                created_by,
                preview_text,
                snapshot_hash
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                doc_id,
                version["snapshot"],
                version["crdt_clock"],
                user_id,
                version.get("preview_text"),
                version.get("snapshot_hash"),
            ),
        )
        try:
            await get_redis().publish(
                "doc:restore",
                f'{{"documentId":"{doc_id}","snapshot":"{version["snapshot"]}"}}',
            )
        except Exception:
            pass

        return {
            "message": "Version restored and broadcast to connected clients",
            "versionId": version["id"],
            "restoredAt": datetime.now(timezone.utc),
            "restoredSnapshot": version["snapshot"],
        }

    async def find_document(self, doc_id: str) -> dict:
        document = await fetch_one(
            """
            SELECT id, title, owner_id, ai_enabled, created_at, updated_at, deleted_at
            FROM documents
            WHERE id = %s AND deleted_at IS NULL
            LIMIT 1
            """,
            (doc_id,),
        )
        if not document:
            raise api_error(status.HTTP_404_NOT_FOUND, "Document not found")
        return document

    async def get_user_role(self, doc_id: str, user_id: str) -> str | None:
        row = await fetch_one(
            """
            SELECT role
            FROM permissions
            WHERE document_id = %s AND user_id = %s
            LIMIT 1
            """,
            (doc_id, user_id),
        )
        return row["role"] if row else None


class PermissionsService:
    def __init__(self, documents_service: DocumentsService | None = None) -> None:
        self.documents_service = documents_service or DocumentsService()

    async def share(self, doc_id: str, email: str, role: str, caller_id: str) -> dict:
        await self.documents_service.find_document(doc_id)
        await self.assert_caller_is_owner(doc_id, caller_id)

        target_user = await fetch_one(
            """
            SELECT id, email, name, avatar_url
            FROM users
            WHERE email = %s
            LIMIT 1
            """,
            (email,),
        )
        if not target_user:
            raise api_error(status.HTTP_404_NOT_FOUND, f"User with email {email} not found")
        if target_user["id"] == caller_id:
            raise api_error(status.HTTP_400_BAD_REQUEST, "Cannot change your own permission")

        existing = await fetch_one(
            """
            SELECT id, document_id, user_id, link_token, role, created_at
            FROM permissions
            WHERE document_id = %s AND user_id = %s
            LIMIT 1
            """,
            (doc_id, target_user["id"]),
        )
        if existing:
            perm = await fetch_one(
                """
                UPDATE permissions
                SET role = %s
                WHERE id = %s
                RETURNING id, document_id, user_id, link_token, role, created_at
                """,
                (role, existing["id"]),
            )
        else:
            perm = await fetch_one(
                """
                INSERT INTO permissions (document_id, user_id, role)
                VALUES (%s, %s, %s)
                RETURNING id, document_id, user_id, link_token, role, created_at
                """,
                (doc_id, target_user["id"], role),
            )

        await publish_permission_change_event(doc_id, target_user["id"], perm["role"])
        return await self.enrich_permission(perm)

    async def list_for_document(self, doc_id: str, caller_id: str) -> list[dict]:
        await self.documents_service.find_document(doc_id)
        await self.assert_caller_is_owner(doc_id, caller_id)
        rows = await fetch_all(
            """
            SELECT p.id, p.document_id, p.user_id, p.link_token, p.role, p.created_at,
                   u.id AS user_id_join, u.name AS user_name, u.email AS user_email, u.avatar_url
            FROM permissions p
            LEFT JOIN users u ON p.user_id = u.id
            WHERE p.document_id = %s
            ORDER BY p.created_at ASC
            """,
            (doc_id,),
        )
        result: list[dict] = []
        for row in rows:
            payload = {
                "id": row["id"],
                "documentId": row["document_id"],
                "userId": row["user_id"],
                "linkToken": row["link_token"],
                "role": row["role"],
                "createdAt": row["created_at"],
                "user": (
                    {
                        "id": row["user_id_join"],
                        "name": row["user_name"],
                        "email": row["user_email"],
                        "avatarUrl": row["avatar_url"],
                    }
                    if row["user_id_join"]
                    else None
                ),
            }
            result.append(payload)
        return result

    async def revoke(self, doc_id: str, permission_id: str, caller_id: str) -> dict:
        await self.documents_service.find_document(doc_id)
        await self.assert_caller_is_owner(doc_id, caller_id)
        permission = await fetch_one(
            """
            SELECT id, user_id, role
            FROM permissions
            WHERE id = %s AND document_id = %s
            LIMIT 1
            """,
            (permission_id, doc_id),
        )
        if not permission:
            raise api_error(status.HTTP_404_NOT_FOUND, "Permission not found")
        if permission["role"] == "owner":
            raise api_error(status.HTTP_403_FORBIDDEN, "Cannot revoke owner permission")
        await execute("DELETE FROM permissions WHERE id = %s", (permission_id,))
        await publish_permission_change_event(doc_id, permission["user_id"], None)
        return {"deleted": True}

    async def assert_caller_is_owner(self, doc_id: str, user_id: str) -> None:
        role = await self.documents_service.get_user_role(doc_id, user_id)
        if role != "owner":
            raise api_error(
                status.HTTP_403_FORBIDDEN,
                "Only the document owner can manage permissions",
            )

    async def enrich_permission(self, permission: dict) -> dict:
        payload = {
            "id": permission["id"],
            "documentId": permission["document_id"],
            "userId": permission["user_id"],
            "linkToken": permission["link_token"],
            "role": permission["role"],
            "createdAt": permission["created_at"],
            "user": None,
        }
        if permission["user_id"]:
            user = await fetch_one(
                """
                SELECT id, name, email, avatar_url
                FROM users
                WHERE id = %s
                LIMIT 1
                """,
                (permission["user_id"],),
            )
            if user:
                payload["user"] = {
                    "id": user["id"],
                    "name": user["name"],
                    "email": user["email"],
                    "avatarUrl": user["avatar_url"],
                }
        return payload


async def ensure_token_not_denied(auth: AuthContext) -> None:
    if not auth.jti:
        return
    denied = await get_redis().sismember("denied_jtis", auth.jti)
    if denied:
        raise api_error(status.HTTP_401_UNAUTHORIZED, "Token has been revoked")
