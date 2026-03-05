"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AxiosError } from "axios";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/axios";
import ProtectedShell from "@/components/ProtectedShell";
import Button from "@/components/Button";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import FormInput from "@/components/form/FormInput";
import TableSkeleton from "@/components/skeleton/TableSkeleton";

interface Permission {
  id: number;
  name: string;
}

interface PaginatedPermissionsResponse {
  data: Permission[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from: number | null;
  to: number | null;
}

interface PaginationMeta {
  currentPage: number;
  lastPage: number;
  perPage: number;
  total: number;
  from: number | null;
  to: number | null;
}

interface DeleteTarget {
  ids: number[];
  label: string;
  isBulk: boolean;
}

const DEFAULT_PER_PAGE = 10;

const normalizePage = (rawPage: string | null): number => {
  const page = Number(rawPage ?? "1");

  if (!Number.isFinite(page) || page < 1) {
    return 1;
  }

  return Math.floor(page);
};

export default function PermissionManagementPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<number[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const [filterSearch, setFilterSearch] = useState("");

  const [pagination, setPagination] = useState<PaginationMeta>({
    currentPage: 1,
    lastPage: 1,
    perPage: DEFAULT_PER_PAGE,
    total: 0,
    from: null,
    to: null,
  });

  const isEditMode = useMemo(() => editingId !== null, [editingId]);
  const selectedPermissionIdsSet = useMemo(() => new Set(selectedPermissionIds), [selectedPermissionIds]);
  const allVisibleSelected = useMemo(
    () => permissions.length > 0 && permissions.every((permission) => selectedPermissionIdsSet.has(permission.id)),
    [permissions, selectedPermissionIdsSet]
  );
  const searchParamsString = searchParams.toString();

  const updateQueryParams = useCallback(
    (updates: Record<string, string | number | null>) => {
      const params = new URLSearchParams(searchParamsString);

      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === "") {
          params.delete(key);
          return;
        }

        params.set(key, String(value));
      });

      const nextQueryString = params.toString();
      const nextUrl = nextQueryString ? `${pathname}?${nextQueryString}` : pathname;
      const currentUrl = searchParamsString ? `${pathname}?${searchParamsString}` : pathname;

      if (nextUrl !== currentUrl) {
        router.push(nextUrl);
      }
    },
    [pathname, router, searchParamsString]
  );

  const loadPermissions = useCallback(async () => {
    setLoading(true);

    const params = new URLSearchParams(searchParamsString);
    const searchValue = (params.get("search") ?? "").trim();
    const pageValue = normalizePage(params.get("page"));

    const requestParams: Record<string, string | number> = {
      page: pageValue,
      per_page: DEFAULT_PER_PAGE,
      paginate: 1,
    };

    if (searchValue !== "") {
      requestParams.search = searchValue;
    }

    try {
      const response = await api.get<PaginatedPermissionsResponse>("/admin/permissions", {
        params: requestParams,
      });

      setPermissions(response.data.data);
      const visibleIds = new Set(response.data.data.map((permission) => permission.id));
      setSelectedPermissionIds((previous) => previous.filter((id) => visibleIds.has(id)));
      setErrors((previous) => {
        if (!previous.general) {
          return previous;
        }

        const next = { ...previous };
        delete next.general;
        return next;
      });
      setPagination({
        currentPage: response.data.current_page,
        lastPage: response.data.last_page,
        perPage: response.data.per_page,
        total: response.data.total,
        from: response.data.from,
        to: response.data.to,
      });
    } catch (error) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setPermissions([]);
      setPagination((previous) => ({
        ...previous,
        currentPage: 1,
        lastPage: 1,
        total: 0,
        from: null,
        to: null,
      }));
      setErrors((previous) => ({
        ...previous,
        general: [axiosError.response?.data?.message || "Failed to load permissions"],
      }));
    } finally {
      setLoading(false);
    }
  }, [searchParamsString]);

  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  useEffect(() => {
    const params = new URLSearchParams(searchParamsString);
    const urlSearch = params.get("search") ?? "";

    setFilterSearch(urlSearch);
  }, [searchParamsString]);

  const resetForm = (closeForm = false) => {
    setEditingId(null);
    setName("");
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

  const handleFilterSubmit = (event: FormEvent) => {
    event.preventDefault();

    updateQueryParams({
      search: filterSearch.trim() || null,
      page: 1,
    });
  };

  const handleFilterReset = () => {
    setFilterSearch("");

    updateQueryParams({
      search: null,
      page: null,
    });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors({});
    setSubmitting(true);

    try {
      if (isEditMode && editingId !== null) {
        await api.put(`/admin/permissions/${editingId}`, { name });
      } else {
        await api.post("/admin/permissions", { name });
      }

      resetForm(true);
      await loadPermissions();
    } catch (error) {
      const axiosError = error as AxiosError<{ errors?: Record<string, string[]>; message?: string }>;
      if (axiosError.response?.data?.errors) {
        setErrors(axiosError.response.data.errors);
      } else {
        setErrors({ general: [axiosError.response?.data?.message || "Failed to save permission"] });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (permission: Permission) => {
    setShowForm(true);
    setEditingId(permission.id);
    setName(permission.name);
    setErrors({});
  };

  const openDeleteModal = (permission: Permission) => {
    setDeleteTarget({ ids: [permission.id], label: `${permission.name} (ID: ${permission.id})`, isBulk: false });
  };

  const openBulkDeleteModal = () => {
    if (selectedPermissionIds.length === 0) {
      return;
    }

    setDeleteTarget({
      ids: selectedPermissionIds,
      label: `${selectedPermissionIds.length} permissions selected`,
      isBulk: true,
    });
  };

  const closeDeleteModal = () => {
    if (deleting) {
      return;
    }

    setDeleteTarget(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    setDeleting(true);

    try {
      if (deleteTarget.isBulk) {
        await api.post("/admin/permissions/bulk-delete", {
          ids: deleteTarget.ids,
        });
        setSelectedPermissionIds([]);
      } else {
        await api.delete(`/admin/permissions/${deleteTarget.ids[0]}`);
      }

      setDeleteTarget(null);
      await loadPermissions();
    } catch (error) {
      const axiosError = error as AxiosError<{ message?: string }>;
      setErrors({ general: [axiosError.response?.data?.message || "Failed to delete permission"] });
    } finally {
      setDeleting(false);
    }
  };

  const handleTogglePermissionSelection = (permissionId: number, checked: boolean) => {
    setSelectedPermissionIds((previous) => {
      if (checked) {
        if (previous.includes(permissionId)) {
          return previous;
        }

        return [...previous, permissionId];
      }

      return previous.filter((id) => id !== permissionId);
    });
  };

  const handleToggleSelectAllVisible = (checked: boolean) => {
    const visibleIds = permissions.map((permission) => permission.id);

    setSelectedPermissionIds((previous) => {
      if (checked) {
        return Array.from(new Set([...previous, ...visibleIds]));
      }

      const visibleSet = new Set(visibleIds);
      return previous.filter((id) => !visibleSet.has(id));
    });
  };

  const goToPage = (page: number) => {
    if (page < 1 || page > pagination.lastPage || page === pagination.currentPage) {
      return;
    }

    updateQueryParams({ page });
  };

  const visiblePages = useMemo(() => {
    const start = Math.max(1, pagination.currentPage - 2);
    const end = Math.min(pagination.lastPage, pagination.currentPage + 2);
    const pages: number[] = [];

    for (let page = start; page <= end; page += 1) {
      pages.push(page);
    }

    return pages;
  }, [pagination.currentPage, pagination.lastPage]);

  return (
    <ProtectedShell title="Permission Management" description="Create, Update, Delete permissions">
      <div className="space-y-6">
        <section className="rounded-2xl border border-white/60 bg-white/80 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Permission Management</h2>
              <p className="text-sm text-slate-500">Create, Update, Delete permissions</p>
            </div>
            <Button type="button" onClick={toggleForm} variant="secondary" size="md">
              {showForm ? "Close" : "Create Permission"}
            </Button>
          </div>
        </section>

        <div
          aria-hidden={!showForm}
          className={`overflow-hidden transition-all duration-300 ease-in-out ${showForm ? "max-h-[520px] opacity-100 translate-y-0" : "max-h-0 opacity-0 -translate-y-2 pointer-events-none"}`}
        >
          <section className="rounded-2xl border border-white/60 bg-white/80 p-5">
            <h3 className="text-sm font-semibold text-slate-900">{isEditMode ? "Update Permission Form" : "Add Permission Form"}</h3>
            <form onSubmit={handleSubmit} className="mt-4 grid gap-4 md:grid-cols-2">
              <FormInput
                id="permission-name"
                label="Permission Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="example: users.view"
                error={errors.name?.[0]}
                containerClassName="md:col-span-2"
              />

              {errors.general && <p className="text-xs text-amber-600 md:col-span-2">{errors.general[0]}</p>}

              <div className="flex gap-2 md:col-span-2">
                <Button type="submit" disabled={submitting} loading={submitting} className="w-full sm:w-auto" size="lg">
                  {isEditMode ? "Update Permission" : "Create Permission"}
                </Button>
                <Button type="button" onClick={() => resetForm(true)} variant="outline" size="lg">
                  Cancel
                </Button>
              </div>
            </form>
          </section>
        </div>

        <section className="rounded-2xl border border-white/60 bg-white/80 p-5">
          <h2 className="text-sm font-semibold text-slate-900">Filter Permissions</h2>
          <form onSubmit={handleFilterSubmit} className="mt-4 flex flex-wrap items-end gap-3">
            <FormInput
              id="filter-permission-search"
              label="Search"
              value={filterSearch}
              onChange={(event) => setFilterSearch(event.target.value)}
              placeholder="Search by permission name"
              containerClassName="w-full sm:min-w-[320px] sm:flex-1"
            />

            <div className="flex w-full gap-2 sm:w-auto">
              <Button type="submit" size="lg" className="w-full sm:w-auto whitespace-nowrap">
                Apply Filters
              </Button>
              <Button type="button" onClick={handleFilterReset} variant="outline" size="lg" className="w-full sm:w-auto whitespace-nowrap">
                Reset
              </Button>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-white/60 bg-white/80 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Permissions Table</h2>
            {selectedPermissionIds.length > 0 && (
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={openBulkDeleteModal}
              >
                Delete Selected ({selectedPermissionIds.length})
              </Button>
            )}
          </div>

          {loading ? (
            <TableSkeleton columns={2} rows={6} />
          ) : (
            <>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="px-2 py-2 font-medium">
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={(event) => handleToggleSelectAllVisible(event.target.checked)}
                          aria-label="Select all visible permissions"
                        />
                      </th>
                      <th className="px-2 py-2 font-medium">Permission</th>
                      <th className="px-2 py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {permissions.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-2 py-6 text-center text-sm text-slate-500">
                          No permissions found for selected filters.
                        </td>
                      </tr>
                    )}

                    {permissions.map((permission) => (
                      <tr key={permission.id} className="border-b border-slate-100 text-slate-700">
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            checked={selectedPermissionIdsSet.has(permission.id)}
                            onChange={(event) => handleTogglePermissionSelection(permission.id, event.target.checked)}
                            aria-label={`Select permission ${permission.name}`}
                          />
                        </td>
                        <td className="px-2 py-2 font-medium">{permission.name}</td>
                        <td className="px-2 py-2">
                          <div className="flex gap-2">
                            <Button type="button" onClick={() => handleEdit(permission)} variant="outline" size="sm">
                              Edit
                            </Button>
                            <Button type="button" onClick={() => openDeleteModal(permission)} variant="danger" size="sm">
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <p>
                    Page {pagination.currentPage} of {pagination.lastPage || 1}
                  </p>
                  <span aria-hidden="true">|</span>
                  <p>
                    Showing {pagination.from ?? 0}-{pagination.to ?? 0} of {pagination.total}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    onClick={() => goToPage(pagination.currentPage - 1)}
                    disabled={pagination.currentPage <= 1}
                    variant="outline"
                    size="sm"
                  >
                    Previous
                  </Button>

                  {visiblePages.map((page) => (
                    <Button key={page} type="button" onClick={() => goToPage(page)} variant={page === pagination.currentPage ? "primary" : "outline"} size="sm">
                      {page}
                    </Button>
                  ))}

                  <Button
                    type="button"
                    onClick={() => goToPage(pagination.currentPage + 1)}
                    disabled={pagination.currentPage >= pagination.lastPage}
                    variant="outline"
                    size="sm"
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}

          {errors.general && <p className="mt-3 text-xs text-amber-600">{errors.general[0]}</p>}
        </section>
      </div>
      <DeleteConfirmModal
        isOpen={deleteTarget !== null}
        title={deleteTarget?.isBulk ? "Delete selected permissions" : "Delete permission"}
        description={
          deleteTarget?.isBulk
            ? "Are you sure you want to delete selected permissions? This action cannot be undone."
            : "Are you sure you want to delete this permission? This action cannot be undone."
        }
        itemName={deleteTarget ? deleteTarget.label : undefined}
        confirmLabel={deleteTarget?.isBulk ? "Delete Permissions" : "Delete Permission"}
        loading={deleting}
        onCancel={closeDeleteModal}
        onConfirm={handleDelete}
      />
    </ProtectedShell>
  );
}
