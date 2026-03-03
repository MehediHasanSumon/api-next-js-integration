"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AxiosError } from "axios";
import api from "@/lib/axios";
import ProtectedShell from "@/components/ProtectedShell";
import Input from "@/components/Input";
import Button from "@/components/Button";

interface Role {
  id: number;
  name: string;
}

interface User {
  id: number;
  name: string;
  email: string;
  roles: Role[];
}

export default function UsersManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setEmail("");
    setPassword("");
    setSelectedRoles([]);
    setErrors({});
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors({});
    setSubmitting(true);

    const payload: { name: string; email: string; password?: string; roles: string[] } = {
      name,
      email,
      roles: selectedRoles,
    };

    if (password.trim() !== "") {
      payload.password = password;
    }

    try {
      if (isEditMode && editingId !== null) {
        await api.put(`/admin/users/${editingId}`, payload);
      } else {
        await api.post("/admin/users", payload);
      }

      resetForm();
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
    setEditingId(user.id);
    setName(user.name);
    setEmail(user.email);
    setPassword("");
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

  const toggleRole = (roleName: string) => {
    setSelectedRoles((prev) => (prev.includes(roleName) ? prev.filter((item) => item !== roleName) : [...prev, roleName]));
  };

  return (
    <ProtectedShell title="Users Managements" description="Create, update, and remove users with role assignment.">
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <section className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-soft">
          <h2 className="text-sm font-semibold text-slate-900">{isEditMode ? "Update User" : "Create User"}</h2>
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <Input label="Name" value={name} onChange={(event) => setName(event.target.value)} error={errors.name?.[0]} />
            <Input label="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} error={errors.email?.[0]} />
            <Input
              label={isEditMode ? "Password (optional)" : "Password"}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              error={errors.password?.[0]}
            />

            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Assign Roles</p>
              <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                {roles.length === 0 && <p className="text-xs text-slate-500">No roles found</p>}
                {roles.map((role) => (
                  <label key={role.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={selectedRoles.includes(role.name)}
                      onChange={() => toggleRole(role.name)}
                    />
                    {role.name}
                  </label>
                ))}
              </div>
            </div>

            {errors.general && <p className="text-xs text-amber-600">{errors.general[0]}</p>}

            <div className="flex gap-2">
              <Button type="submit" disabled={submitting} loading={submitting} className="w-full">
                {isEditMode ? "Update User" : "Create User"}
              </Button>
              {isEditMode && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-white/60 bg-white/80 p-5 shadow-soft">
          <h2 className="text-sm font-semibold text-slate-900">Users List</h2>
          {loading ? (
            <p className="mt-4 text-sm text-slate-500">Loading users...</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="px-2 py-2 font-medium">Name</th>
                    <th className="px-2 py-2 font-medium">Email</th>
                    <th className="px-2 py-2 font-medium">Roles</th>
                    <th className="px-2 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-slate-100 text-slate-700">
                      <td className="px-2 py-2">{user.name}</td>
                      <td className="px-2 py-2">{user.email}</td>
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
