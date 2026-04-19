from fastapi import APIRouter, Response, status

from app.dependencies import CurrentUser
from app.http import (
    DocumentOut,
    DocumentWithRoleOut,
    PermissionOut,
    RestoreResponse,
    VersionOut,
)
from app.models import CreateDocumentInput, ShareDocumentInput, UpdateDocumentInput
from app.security import AuthContext, parse_uuid
from app.services import DocumentsService, PermissionsService


router = APIRouter(prefix="/documents", tags=["documents"])
documents_service = DocumentsService()
permissions_service = PermissionsService(documents_service)


@router.post("", response_model=DocumentOut, summary="Create a document")
async def create_document(body: CreateDocumentInput, current_user: AuthContext = CurrentUser):
    return await documents_service.create(body.title, current_user.user_id)


@router.get("", response_model=list[DocumentWithRoleOut], summary="List accessible documents")
async def list_documents(current_user: AuthContext = CurrentUser):
    return await documents_service.list_for_user(current_user.user_id)


@router.get("/{doc_id}", response_model=DocumentWithRoleOut, summary="Get a document")
async def get_document(doc_id: str, current_user: AuthContext = CurrentUser):
    return await documents_service.get_by_id(
        parse_uuid(doc_id, "document ID"),
        current_user.user_id,
    )


@router.patch("/{doc_id}", response_model=DocumentOut, summary="Update a document")
async def update_document(
    doc_id: str,
    body: UpdateDocumentInput,
    current_user: AuthContext = CurrentUser,
):
    return await documents_service.update(
        parse_uuid(doc_id, "document ID"),
        body.model_dump(exclude_none=False),
        current_user.user_id,
    )


@router.delete(
    "/{doc_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Soft delete a document",
)
async def delete_document(doc_id: str, current_user: AuthContext = CurrentUser):
    await documents_service.soft_delete(
        parse_uuid(doc_id, "document ID"),
        current_user.user_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{doc_id}/versions", response_model=list[VersionOut], summary="List document versions")
async def list_versions(doc_id: str, current_user: AuthContext = CurrentUser):
    return await documents_service.list_versions(
        parse_uuid(doc_id, "document ID"),
        current_user.user_id,
    )


@router.post(
    "/{doc_id}/versions/{version_id}/restore",
    response_model=RestoreResponse,
    summary="Restore a document version",
)
async def restore_version(doc_id: str, version_id: str, current_user: AuthContext = CurrentUser):
    return await documents_service.restore_version(
        parse_uuid(doc_id, "document ID"),
        parse_uuid(version_id, "version ID"),
        current_user.user_id,
    )


@router.post("/{doc_id}/share", response_model=PermissionOut, summary="Share document by email")
async def share_document(
    doc_id: str,
    body: ShareDocumentInput,
    current_user: AuthContext = CurrentUser,
):
    return await permissions_service.share(
        parse_uuid(doc_id, "document ID"),
        body.email,
        body.role,
        current_user.user_id,
    )


@router.get(
    "/{doc_id}/permissions",
    response_model=list[PermissionOut],
    summary="List document permissions",
)
async def list_permissions(doc_id: str, current_user: AuthContext = CurrentUser):
    return await permissions_service.list_for_document(
        parse_uuid(doc_id, "document ID"),
        current_user.user_id,
    )


@router.delete(
    "/{doc_id}/permissions/{permission_id}",
    summary="Revoke a document permission",
)
async def revoke_permission(
    doc_id: str,
    permission_id: str,
    current_user: AuthContext = CurrentUser,
):
    return await permissions_service.revoke(
        parse_uuid(doc_id, "document ID"),
        parse_uuid(permission_id, "permission ID"),
        current_user.user_id,
    )
