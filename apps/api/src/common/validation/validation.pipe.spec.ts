import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { IsNumber, IsString } from 'class-validator';

class SampleUserDto {
  @IsString()
  name!: string;

  @IsNumber()
  age!: number;
}

describe('Global ValidationPipe Enforcements', () => {
  let pipe: ValidationPipe;

  beforeEach(() => {
    pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
  });

  it('should accept and transform valid DTO payload', async () => {
    const rawPayload = { name: 'Alice', age: 30 };
    const transformed = (await pipe.transform(rawPayload, {
      type: 'body',
      metatype: SampleUserDto,
    })) as SampleUserDto;

    expect(transformed).toBeInstanceOf(SampleUserDto);
    expect(transformed.name).toBe('Alice');
    expect(transformed.age).toBe(30);
  });

  it('should reject payload with unknown non-whitelisted property', async () => {
    const invalidPayload = { name: 'Alice', age: 30, adminRole: 'SUPERADMIN' };

    await expect(
      pipe.transform(invalidPayload, {
        type: 'body',
        metatype: SampleUserDto,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject payload with invalid data type', async () => {
    const invalidPayload = { name: 'Alice', age: 'not-a-number' };

    await expect(
      pipe.transform(invalidPayload, {
        type: 'body',
        metatype: SampleUserDto,
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
