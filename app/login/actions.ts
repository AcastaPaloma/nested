"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export async function login(formData: FormData) {
  const supabase = await createClient();

  const data = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  const { error } = await supabase.auth.signInWithPassword(data);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/flow");
}

export async function signup(formData: FormData) {
  const supabase = await createClient();
  const requestHeaders = await headers();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  // Validate passwords match
  if (password !== confirmPassword) {
    return { error: "Passwords do not match" };
  }

  // Validate password strength
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters" };
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${requestHeaders.get("origin") ?? "http://localhost:3000"}/auth/confirm`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { success: "Check your email for the confirmation link!" };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
