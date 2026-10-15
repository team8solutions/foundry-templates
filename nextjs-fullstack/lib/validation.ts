import { z } from "zod";

const email = z.string().trim().toLowerCase().email().max(255);
const password = z
  .string()
  .min(8)
  .max(100)
  .refine((value) => new TextEncoder().encode(value).byteLength <= 72, {
    message: "Password must be at most 72 bytes",
  });

export const signUpSchema = z.object({
  email,
  password,
});

export const signInSchema = signUpSchema;

export const profileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email,
});

export const passwordChangeSchema = z
  .object({
    currentPassword: password,
    newPassword: password,
    confirmPassword: password,
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "New password and confirmation do not match",
    path: ["confirmPassword"],
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: "New password must be different",
    path: ["newPassword"],
  });
