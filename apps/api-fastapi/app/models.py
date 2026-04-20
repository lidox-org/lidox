from pydantic import EmailStr, Field, field_validator

from app.http import APIModel


class RegisterInput(APIModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=100)


class LoginInput(APIModel):
    email: EmailStr
    password: str = Field(min_length=1)


class UpdateProfileInput(APIModel):
    name: str = Field(min_length=1, max_length=100)


class ChangePasswordInput(APIModel):
    currentPassword: str = Field(min_length=1)
    newPassword: str = Field(min_length=8, max_length=128)


class CreateDocumentInput(APIModel):
    title: str = Field(default="Untitled Document", min_length=1, max_length=500)
    templateId: str | None = None


class UpdateDocumentInput(APIModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    aiEnabled: bool | None = None


class ShareDocumentInput(APIModel):
    email: EmailStr
    role: str

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        if value not in {"editor", "commenter", "viewer"}:
            raise ValueError("Role must be editor, commenter, or viewer")
        return value


class ExportPdfInput(APIModel):
    title: str | None = Field(default=None, max_length=500)
    text: str = Field(default="")
