import { z } from 'zod';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRegex = /^\+?[0-9]{10,15}$/;

export function normalizeContact(value) {
  return String(value || '').trim();
}

export function detectContactType(value) {
  const contact = normalizeContact(value);
  if (emailRegex.test(contact.toLowerCase())) return 'email';
  const digits = contact.replace(/[\s()-]/g, '');
  if (phoneRegex.test(digits)) return 'phone';
  return null;
}

export const registerSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, 'Please enter your full name')
      .max(80, 'Name is too long'),
    contact: z.string().trim().min(1, 'Email or phone is required'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(72, 'Password is too long')
      .regex(/[A-Za-z]/, 'Password must include a letter')
      .regex(/[0-9]/, 'Password must include a number'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: 'Passwords do not match',
      });
    }
    const type = detectContactType(data.contact);
    if (!type) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['contact'],
        message: 'Enter a valid email address or phone number',
      });
    }
  });

export const loginSchema = z.object({
  contact: z.string().trim().min(1, 'Email or phone is required'),
  password: z.string().min(1, 'Password is required'),
});

export const setLocationSchema = z.object({
  areaId: z.string().uuid('Select a valid area'),
});

export const resolveLocationSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});
