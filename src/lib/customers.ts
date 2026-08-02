import type { Customer } from "./db.types";

export interface CustomerForm {
  name: string;
  phone: string;
  email: string;
}

export interface CustomerFormErrors {
  name?: string;
  phone?: string;
  email?: string;
}

export function validateCustomerForm(form: CustomerForm): CustomerFormErrors {
  const errors: CustomerFormErrors = {};
  if (!form.name.trim()) {
    errors.name = "Name is required";
  }
  const phone = form.phone.trim();
  if (phone && !/^[0-9+\-() ]{6,20}$/.test(phone)) {
    errors.phone = "Enter a valid phone number";
  }
  const email = form.email.trim();
  if (email && !/^\S+@\S+\.\S+$/.test(email)) {
    errors.email = "Enter a valid email address";
  }
  return errors;
}

/** Case-insensitive match against name, phone or email. */
export function searchCustomers(customers: Customer[], query: string): Customer[] {
  const q = query.trim().toLowerCase();
  if (!q) return customers;
  return customers.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      (c.phone ?? "").toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q)
  );
}

export function sortCustomersByName(customers: Customer[]): Customer[] {
  return [...customers].sort((a, b) => a.name.localeCompare(b.name));
}
