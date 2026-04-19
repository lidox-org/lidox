import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

const TEST_USER = {
  userId: '11111111-1111-4111-8111-111111111111',
  email: 'qa@example.com',
  jti: '22222222-2222-4222-8222-222222222222',
};

describe('DocumentsController (integration)', () => {
  let controller: DocumentsController;

  const documentsService = {
    create: jest.fn(),
    listForUser: jest.fn(),
    getById: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    listVersions: jest.fn(),
    restoreVersion: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DocumentsController],
      providers: [
        {
          provide: DocumentsService,
          useValue: documentsService,
        },
      ],
    }).compile();

    controller = moduleRef.get(DocumentsController);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockRequest = (): Request => ({ user: TEST_USER }) as unknown as Request;

  it('lists documents for the authenticated user', async () => {
    documentsService.listForUser.mockResolvedValue([
      {
        id: '33333333-3333-4333-8333-333333333333',
        title: 'Assignment Draft',
        role: 'owner',
      },
    ]);

    const response = await controller.list(mockRequest());

    expect(documentsService.listForUser).toHaveBeenCalledWith(TEST_USER.userId);
    expect(response).toEqual([
      {
        id: '33333333-3333-4333-8333-333333333333',
        title: 'Assignment Draft',
        role: 'owner',
      },
    ]);
  });

  it('rejects invalid document ids before hitting the service', async () => {
    await expect(
      controller.getById('not-a-uuid', mockRequest()),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(documentsService.getById).not.toHaveBeenCalled();
  });

  it('rejects invalid restore identifiers before hitting the service', async () => {
    await expect(
      controller.restoreVersion('not-a-uuid', 'not-a-uuid', mockRequest()),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(documentsService.restoreVersion).not.toHaveBeenCalled();
  });
});
