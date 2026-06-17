import { CheckCircle2, CircleOff, Pencil, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { StatusPill } from "@/components/ui/status-pill";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  createDocumentCategory,
  createDocumentTemplate,
  toggleDocumentCategoryActive,
  toggleDocumentTemplateActive,
  updateDocumentCategory,
  updateDocumentTemplate
} from "./actions";

type DocumentCategory = {
  id: string;
  name: string;
  description: string;
  sort_order: number;
  active: boolean;
};

type DocumentTemplate = {
  id: string;
  name: string;
  category: string;
  category_id: string | null;
  description: string;
  active: boolean;
};

export default async function DocumentsPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; success?: string; q?: string; category?: string }>;
}) {
  const profile = await requireProfile();
  const params = await searchParams;
  const supabase = await createClient();
  const [{ data: categoryData, error: categoriesError }, { data: documentData, error: documentsError }] = await Promise.all([
    supabase.from("document_categories").select("*").order("sort_order").order("name"),
    supabase.from("document_templates").select("*").order("category").order("name")
  ]);

  const categories = (categoryData ?? []) as DocumentCategory[];
  const documents = ((documentData ?? []) as DocumentTemplate[]).map((document) => {
    const category = categories.find((item) => item.id === document.category_id);
    return { ...document, category: category?.name ?? document.category ?? "General" };
  });
  const filteredDocuments = filterDocuments(documents, params);
  const groupedDocuments = groupDocuments(filteredDocuments, categories);
  const canManage = profile.role === "admin";

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-bold uppercase text-[#6a912f]">Quotation library</p>
        <h1 className="mt-1 text-3xl font-black text-black">Document templates</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
          Keep documents grouped by category so service setup and quote editing stay quick even when the library grows.
        </p>
      </header>

      {params.error ? <Notice tone="red">{params.error}</Notice> : null}
      {params.success ? <Notice tone="green">{params.success}</Notice> : null}
      {categoriesError ? <Notice tone="red">{friendlyReadError(categoriesError.message)}</Notice> : null}
      {documentsError ? <Notice tone="red">{friendlyReadError(documentsError.message)}</Notice> : null}

      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          {canManage ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>New document</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={createDocumentTemplate} className="grid gap-3">
                  <Field label="Name">
                    <Input name="name" placeholder="PAN Card" required />
                  </Field>
                  <Field label="Category">
                    <Select name="category_id" required>
                      <option value="">Select category</option>
                      {categories
                        .filter((category) => category.active)
                        .map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                    </Select>
                  </Field>
                  <Field label="Description">
                    <Textarea className="min-h-20" name="description" placeholder="Short internal or client-facing note" />
                  </Field>
                  <label className="flex items-center gap-2 text-xs font-bold text-neutral-700">
                    <input name="active" type="checkbox" value="true" defaultChecked className="h-4 w-4" />
                    Active
                  </label>
                  <Button type="submit">Save document</Button>
                </form>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Categories</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {canManage ? (
                <details className="rounded-md border border-[#d9ded1] bg-[#fbfcf8]">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-black">Add category</summary>
                  <form action={createDocumentCategory} className="grid gap-3 border-t border-[#e6ebdc] p-3">
                    <Input name="name" placeholder="Identity" required />
                    <Input name="sort_order" type="number" min="0" defaultValue="100" placeholder="Sort order" />
                    <Textarea className="min-h-16" name="description" placeholder="Optional note" />
                    <label className="flex items-center gap-2 text-xs font-bold text-neutral-700">
                      <input name="active" type="checkbox" value="true" defaultChecked className="h-4 w-4" />
                      Active
                    </label>
                    <Button type="submit" variant="ghost">Save category</Button>
                  </form>
                </details>
              ) : null}

              <div className="grid gap-2">
                {categories.map((category) => (
                  <details key={category.id} className="rounded-md border border-[#e6ebdc] bg-white">
                    <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="font-black">{category.name}</span>
                      <span className="text-xs text-neutral-500">
                        {documents.filter((document) => document.category_id === category.id || document.category === category.name).length}
                      </span>
                    </summary>
                    <div className="border-t border-[#e6ebdc] p-3">
                      <p className="text-xs leading-5 text-neutral-500">{category.description || "No description."}</p>
                      {canManage ? <CategoryEditForm category={category} /> : null}
                    </div>
                  </details>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
              <CardTitle>{filteredDocuments.length} documents</CardTitle>
              <form className="grid gap-2 sm:grid-cols-[1fr_180px_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-neutral-400" />
                  <Input className="pl-9" name="q" defaultValue={params.q ?? ""} placeholder="Search documents" />
                </div>
                <Select name="category" defaultValue={params.category ?? ""}>
                  <option value="">All categories</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.name}>
                      {category.name}
                    </option>
                  ))}
                </Select>
                <Button type="submit" variant="ghost">Search</Button>
              </form>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {groupedDocuments.map((group) => (
              <section key={group.category} className="rounded-md border border-[#e6ebdc] bg-[#fbfcf8]">
                <div className="flex items-center justify-between border-b border-[#e6ebdc] px-3 py-2">
                  <p className="text-sm font-black text-black">{group.category}</p>
                  <StatusPill>{group.documents.length} items</StatusPill>
                </div>
                <div className="divide-y divide-[#e6ebdc]">
                  {group.documents.map((document) => (
                    <DocumentRow key={document.id} document={document} categories={categories} canManage={canManage} />
                  ))}
                </div>
              </section>
            ))}
            {!groupedDocuments.length ? (
              <div className="rounded-md border border-dashed border-[#d9ded1] p-6 text-center text-sm text-neutral-500">
                No document templates match this view.
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DocumentRow({
  document,
  categories,
  canManage
}: {
  document: DocumentTemplate;
  categories: DocumentCategory[];
  canManage: boolean;
}) {
  return (
    <div className="px-3 py-2">
      <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-black text-black">{document.name}</p>
            <StatusPill tone={document.active ? "green" : "red"}>{document.active ? "Active" : "Inactive"}</StatusPill>
          </div>
          <p className="mt-1 truncate text-xs text-neutral-500">{document.description || "No description."}</p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <form action={toggleDocumentTemplateActive}>
              <input type="hidden" name="id" value={document.id} />
              <input type="hidden" name="active" value={String(!document.active)} />
              <Button type="submit" variant="ghost">
                {document.active ? <CircleOff className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                {document.active ? "Off" : "On"}
              </Button>
            </form>
          </div>
        ) : null}
      </div>
      {canManage ? <DocumentEditDetails document={document} categories={categories} /> : null}
    </div>
  );
}

function DocumentEditDetails({ document, categories }: { document: DocumentTemplate; categories: DocumentCategory[] }) {
  return (
    <details className="mt-2 rounded-md border border-[#d9ded1] bg-white">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-black text-black">
        <Pencil className="h-3.5 w-3.5" />
        Edit
      </summary>
      <form action={updateDocumentTemplate} className="grid gap-3 border-t border-[#e6ebdc] p-3">
        <input type="hidden" name="id" value={document.id} />
        <div className="grid gap-3 md:grid-cols-2">
          <Input name="name" defaultValue={document.name} required />
          <Select name="category_id" defaultValue={document.category_id ?? ""} required>
            <option value="">Select category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </div>
        <Textarea className="min-h-16" name="description" defaultValue={document.description} />
        <label className="flex items-center gap-2 text-xs font-bold text-neutral-700">
          <input name="active" type="checkbox" value="true" defaultChecked={document.active} className="h-4 w-4" />
          Active
        </label>
        <Button type="submit">Save changes</Button>
      </form>
    </details>
  );
}

function CategoryEditForm({ category }: { category: DocumentCategory }) {
  return (
    <details className="mt-3 rounded-md border border-[#d9ded1] bg-white">
      <summary className="cursor-pointer px-3 py-2 text-xs font-black">Edit category</summary>
      <div className="grid gap-3 border-t border-[#e6ebdc] p-3">
        <form action={updateDocumentCategory} className="grid gap-3">
          <input type="hidden" name="id" value={category.id} />
          <Input name="name" defaultValue={category.name} required />
          <Input name="sort_order" type="number" min="0" defaultValue={category.sort_order} />
          <Textarea className="min-h-16" name="description" defaultValue={category.description} />
          <label className="flex items-center gap-2 text-xs font-bold text-neutral-700">
            <input name="active" type="checkbox" value="true" defaultChecked={category.active} className="h-4 w-4" />
            Active
          </label>
          <Button type="submit">Save category</Button>
        </form>
        <div className="flex flex-wrap gap-2">
          <form action={toggleDocumentCategoryActive}>
            <input type="hidden" name="id" value={category.id} />
            <input type="hidden" name="active" value={String(!category.active)} />
            <Button type="submit" variant="ghost">{category.active ? "Deactivate" : "Activate"}</Button>
          </form>
        </div>
      </div>
    </details>
  );
}

function filterDocuments(documents: DocumentTemplate[], params: { q?: string; category?: string }) {
  const query = (params.q ?? "").trim().toLowerCase();
  return documents.filter((document) => {
    const queryMatch =
      !query ||
      [document.name, document.category, document.description].join(" ").toLowerCase().includes(query);
    const categoryMatch = !params.category || document.category === params.category;
    return queryMatch && categoryMatch;
  });
}

function groupDocuments(documents: DocumentTemplate[], categories: DocumentCategory[]) {
  const categoryOrder = new Map(categories.map((category, index) => [category.name, index]));
  const grouped = documents.reduce<Record<string, DocumentTemplate[]>>((groups, document) => {
    groups[document.category] = [...(groups[document.category] ?? []), document];
    return groups;
  }, {});

  return Object.entries(grouped)
    .sort(([a], [b]) => (categoryOrder.get(a) ?? 999) - (categoryOrder.get(b) ?? 999) || a.localeCompare(b))
    .map(([category, groupDocuments]) => ({ category, documents: groupDocuments }));
}

function Notice({ tone, children }: { tone: "green" | "red"; children: React.ReactNode }) {
  return (
    <div
      className={`rounded-md border p-4 text-sm font-semibold ${
        tone === "green" ? "border-[#d9ead3] bg-[#edf7df] text-[#405f16]" : "border-[#f4c7c3] bg-[#fff0ed] text-[#b42318]"
      }`}
    >
      {children}
    </div>
  );
}

function friendlyReadError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("relation") || lower.includes("schema cache")) {
    return "Document templates could not load. Run migrations 0003 and 0004 in Supabase SQL Editor.";
  }
  return message;
}
