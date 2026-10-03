import { ContactController } from './contact.controller';

describe('ContactController - Suppression Endpoints', () => {
  let controller: ContactController;
  let createContactUseCase: any;
  let discoverContactsUseCase: any;
  let getCompanyContactsUseCase: any;
  let getContactByIdUseCase: any;
  let selectContactUseCase: any;
  let suppressContactUseCase: any;
  let unsuppressContactUseCase: any;

  beforeEach(() => {
    createContactUseCase = { execute: jest.fn() };
    discoverContactsUseCase = { execute: jest.fn() };
    getCompanyContactsUseCase = { execute: jest.fn() };
    getContactByIdUseCase = { execute: jest.fn() };
    selectContactUseCase = { execute: jest.fn() };
    suppressContactUseCase = { execute: jest.fn() };
    unsuppressContactUseCase = { execute: jest.fn() };

    controller = new ContactController(
      createContactUseCase,
      discoverContactsUseCase,
      getCompanyContactsUseCase,
      getContactByIdUseCase,
      selectContactUseCase,
      suppressContactUseCase,
      unsuppressContactUseCase,
    );
  });

  it('delegates suppress contact call to SuppressContactUseCase', async () => {
    const req = {
      workspace: { id: 'ws-1' },
      user: { id: 'usr-1' },
    } as any;
    suppressContactUseCase.execute.mockResolvedValue({
      success: true,
      email: 'alex@example.com',
    });

    const result = await controller.suppressContact(
      req,
      'contact-1',
      { reason: 'USER_REQUEST' as any, notes: 'opt-out' },
    );

    expect(suppressContactUseCase.execute).toHaveBeenCalledWith(
      'ws-1',
      'contact-1',
      'usr-1',
      'USER_REQUEST',
      'opt-out',
    );
    expect(result).toEqual({ success: true, email: 'alex@example.com' });
  });

  it('delegates unsuppress contact call to UnsuppressContactUseCase', async () => {
    const req = {
      workspace: { id: 'ws-1' },
      user: { id: 'usr-1' },
    } as any;
    unsuppressContactUseCase.execute.mockResolvedValue({
      success: true,
      email: 'alex@example.com',
    });

    const result = await controller.unsuppressContact(req, 'contact-1');

    expect(unsuppressContactUseCase.execute).toHaveBeenCalledWith(
      'ws-1',
      'contact-1',
      'usr-1',
    );
    expect(result).toEqual({ success: true, email: 'alex@example.com' });
  });
});
