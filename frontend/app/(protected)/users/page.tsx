"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AxiosError } from "axios";
import api from "@/lib/axios";
import ProtectedShell from "@/components/ProtectedShell";
import Button from "@/components/Button";
import FormCheckbox from "@/components/form/FormCheckbox";
import FormInput from "@/components/form/FormInput";
import FormLabel from "@/components/form/FormLabel";
import FormOptionCheckbox from "@/components/form/FormOptionCheckbox";

interface Role {
  id: number;
  name: string;
}

interface User {
  id: number;
  name: string;
  email: string;
  email_verified_at: string | null;
  roles: Role[];
}

export default function UsersManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);

  const isEditMode = useMemo(() => editingId !== null, [editingId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersResponse, rolesResponse] = await Promise.all([api.get("/admin/users"), api.get("/admin/roles")]);
      setUsers(usersResponse.data);
      setRoles(rolesResponse.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const resetForm = (closeForm = false) => {
    setEditingId(null);
    setName("");
    setEmail("");
    setPassword("");
    setPasswordConfirmation("");
    setEmailVerified(false);
    setSelectedRoles([]);
    setErrors({});

    if (closeForm) {
      setShowForm(false);
    }
  };

  const toggleForm = () => {
    if (showForm) {
      resetForm(true);
      return;
    }

    setShowForm(true);
  };

  const toggleRole = (roleName: string) => {
    setSelectedRoles((prev) => (prev.includes(roleName) ? prev.filter((item) => item !== roleName) : [...prev, roleName]));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors({});

    const clientErrors: Record<string, string[]> = {};

    if (!isEditMode && password.trim() === "") {
      clientErrors.password = ["Password is required"];
    }

    if (password.trim() !== "" && password !== passwordConfirmation) {
      clientErrors.password_confirmation = ["Password confirmation does not match"];
    }

    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return;
    }

    setSubmitting(true);

    const payload: {
      name: string;
      email: string;
      email_verified: boolean;
      roles: string[];
      password?: string;
      password_confirmation?: string;
    } = {
      name,
      email,
      email_verified: emailVerified,
      roles: selectedRoles,
    };

    if (password.trim() !== "") {
      payload.password = password;
      payload.password_confirmation = passwordConfirmation;
    }

    try {
      if (isEditMode && editingId !== null) {
        await api.put(`/admin/users/${editingId}`, payload);
      } else {
        await api.post("/admin/users", payload);
      }

      resetForm(true);
      await loadData();
    } catch (error) {
      const axiosError = error as AxiosError<{ errors?: Record<string, string[]>; message?: string }>;
      if (axiosError.response?.data?.errors) {
        setErrors(axiosError.response.data.errors);
      } else {
        setErrors({ general: [axiosError.response?.data?.message || "Failed to save user"] });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (user: User) => {
    setShowForm(true);
    setEditingId(user.id);
    setName(user.name);
    setEmail(user.email);
    setPassword("");
    setPasswordConfirmation("");
    setEmailVerified(Boolean(user.email_verified_at));
    setSelectedRoles(user.roles.map((role) => role.name));
    setErrors({});
  };

  const handleDelete = async (userId: number) => {
    if (!window.confirm("Delete this user?")) {
      return;
    }

    try {
      await api.delete(`/admin/users/${userId}`);
      await loadData();
    } catch (error) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setErrors({ general: [axiosError.response?.data?.message || "Failed to delete user"] });
    }
  };

  return (
    <ProtectedShell title="User Management" description="Create, Update, Delete users">
      <div className="space-y-6">
        <section className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-soft">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">User Management</h2>
              <p className="text-sm text-slate-500">Create, Update, Delete users</p>
            </div>
            <button
              type="button"
              onClick={toggleForm}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              {showForm ? "Close" : "Create User"}
            </button>
          </div>
        </section>

        <div
          aria-hidden={!showForm}
          className={`overflow-hidden transition-all duration-300 ease-in-out ${showForm ? "max-h-[1400px] opacity-100 translate-y-0" : "max-h-0 opacity-0 -translate-y-2 pointer-events-none"}`}
        >
          <section className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-soft">
            <h3 className="text-sm font-semibold text-slate-900">{isEditMode ? "Update User Form" : "Add User Form"}</h3>

            <form onSubmit={handleSubmit} className="mt-4 grid gap-4 md:grid-cols-2">
              <FormInput
                id="user-name"
                label="Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Enter full name"
                error={errors.name?.[0]}
              />

              <FormInput
                id="user-email"
                label="Email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
                error={errors.email?.[0]}
              />

              <FormInput
                id="user-password"
                label="Password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={isEditMode ? "Leave blank to keep current" : "At least 8 characters"}
                error={errors.password?.[0]}
              />

              <FormInput
                id="user-password-confirmation"
                label="Confirmation Password"
                type="password"
                value={passwordConfirmation}
                onChange={(event) => setPasswordConfirmation(event.target.value)}
                placeholder="Re-enter password"
                error={errors.password_confirmation?.[0]}
              />

              <div className="md:col-span-2">
                <FormCheckbox
                  name="email_verified"
                  label="Email Verified At"
                  checked={emailVerified}
                  onChange={(event) => setEmailVerified(event.target.checked)}
                  description="Enable this to mark the user email as verified."
                  error={errors.email_verified?.[0] || errors.email_verified_at?.[0]}
                />
              </div>

              <div className="md:col-span-2">
                <FormLabel text="Role" />
                <div className="mt-1.5 grid gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-3 sm:grid-cols-2 lg:grid-cols-3">
                  {roles.length === 0 && <p className="text-xs text-slate-500">No roles found</p>}
                  {roles.map((role) => (
                    <FormOptionCheckbox
                      key={role.id}
                      label={role.name}
                      checked={selectedRoles.includes(role.name)}
                      onChange={() => toggleRole(role.name)}
                    />
                  ))}
                </div>
                {errors.roles?.[0] && <p className="mt-1 text-xs text-rose-600">{errors.roles[0]}</p>}
              </div>

              {errors.general && <p className="text-xs text-amber-600 md:col-span-2">{errors.general[0]}</p>}

              <div className="flex gap-2 md:col-span-2">
                <Button type="submit" disabled={submitting} loading={submitting} className="w-full sm:w-auto">
                  {isEditMode ? "Update User" : "Create User"}
                </Button>
                <button
                  type="button"
                  onClick={() => resetForm(true)}
                  className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>

        <section className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-soft">
          <h2 className="text-sm font-semibold text-slate-900">Users Table</h2>
          {loading ? (
            <p className="mt-4 text-sm text-slate-500">Loading users...</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="px-2 py-2 font-medium">Name</th>
                    <th className="px-2 py-2 font-medium">Email</th>
                    <th className="px-2 py-2 font-medium">Email Verified</th>
                    <th className="px-2 py-2 font-medium">Role</th>
                    <th className="px-2 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-slate-100 text-slate-700">
                      <td className="px-2 py-2">{user.name}</td>
                      <td className="px-2 py-2">{user.email}</td>
                      <td className="px-2 py-2 text-xs">
                        {user.email_verified_at ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700">Verified</span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700">Not verified</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-1">
                          {user.roles.length === 0 && <span className="text-xs text-slate-400">No role</span>}
                          {user.roles.map((role) => (
                            <span key={role.id} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                              {role.name}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleEdit(user)}
                            className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(user.id)}
                            className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </ProtectedShell>
  );
}
