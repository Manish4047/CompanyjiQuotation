import Link from "next/link";
import { CheckCircle2, CircleOff, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/field";
import { StatusPill } from "@/components/ui/status-pill";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  createPipelineTag,
  createPipelineTagCategory,
  createQuoteFolder,
  deletePipelineTag,
  deletePipelineTagCategory,
  deleteQuoteFolder,
  togglePipelineTagActive,
  togglePipelineTagCategoryActive,
  toggleQuoteFolderActive,
  updatePipelineTag,
  updatePipelineTagCategory,
  updateQuoteFolder
} from "./actions";

type QuoteFolder = {
  id: string;
  name: string;
  description: string;
  sort_order: number;
  active: boolean;
};

type PipelineTagCategory = {
  id: string;
  name: string;
  description: string;
  sort_order: number;
  active: boolean;
};

type PipelineTag = {
  id: string;
  name: string;
  description: string;
  sort_order: number;
  active: boolean;
  category_id: string | null;
};

export default async function PipelineSetupPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const profile = await requireProfile();
  const params = await searchParams;
  const canManage = profile.role === "admin" || profile.role === "manager";
  const isAdmin = profile.role === "admin";
  const supabase = await createClient();

  const [
    { data: folderData, error: foldersError },
    { data: categoryData, error: categoriesError },
    { data: tagData, error: tagsError }
  ] = await Promise.all([
    supabase.from("quote_folders").select("*").order("sort_order").order("name"),
    supabase.from("pipeline_tag_categories").select("*").order("sort_order").order("name"),
    supabase.from("pipeline_tags").select("*").order("sort_order").order("name")
  ]);

  const folders = (folderData ?? []) as QuoteFolder[];
  const categories = (categoryData ?? []) as PipelineTagCategory[];
  const tags = (tagData ?? []) as PipelineTag[];
  const groupedTags = groupTags(tags, categories);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-bold uppercase text-[#6a912f]">Pipeline setup</p>
          <h1 className="mt-1 text-3xl font-black text-black">Folders and defined tags</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
            Keep folders and tags controlled here so pipeline, new quote, and list building stay consistent.
          </p>
        </div>
        <Link href="/campaigns" className="rounded-md border border-[#d9ded1] bg-white px-3 py-2 text-sm font-black text-black">
          Open Campaigns &amp; Lists
        </Link>
      </header>

      {params.error ? <Notice tone="red">{params.error}</Notice> : null}
      {params.success ? <Notice tone="green">{params.success}</Notice> : null}
      {foldersError ? <Notice tone="red">{friendlyReadError(foldersError.message)}</Notice> : null}
      {categoriesError ? <Notice tone="red">{friendlyReadError(categoriesError.message)}</Notice> : null}
      {tagsError ? <Notice tone="red">{friendlyReadError(tagsError.message)}</Notice> : null}

      {canManage ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <CompactCreateCard title="New folder">
            <form action={createQuoteFolder} className="grid gap-3">
              <Input name="name" placeholder="Archive" required />
              <Input name="sort_order" type="number" min="0" defaultValue="100" />
              <Textarea className="min-h-16" name="description" placeholder="Short note" />
              <label className="flex items-center gap-2 text-xs font-bold text-neutral-700">
                <input name="active" type="checkbox" value="true" defaultChecked className="h-4 w-4" />
                Active
              </label>
              <Button type="submit">Save folder</Button>
            </form>
          </CompactCreateCard>

          <CompactCreateCard title="New tag category">
            <form action={createPipelineTagCategory} className="grid gap-3">
              <Input name="name" placeholder="Temperature" required />
              <Input name="sort_order" type="number" min="0" defaultValue="100" />
              <Textarea className="min-h-16" name="description" placeholder="Short note" />
              <label className="flex items-center gap-2 text-xs font-bold text-neutral-700">
                <input name="active" type="checkbox" value="true" defaultChecked className="h-4 w-4" />
                Active
              </label>
              <Button type="submit">Save category</Button>
            </form>
          </CompactCreateCard>

          <CompactCreateCard title="New tag">
            <form action={createPipelineTag} className="grid gap-3">
              <Input name="name" placeholder="Hot" required />
              <Select name="category_id" required defaultValue="">
                <option value="">Select category</option>
                {categories
                  .filter((category) => category.active)
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </Select>
              <Input name="sort_order" type="number" min="0" defaultValue="100" />
              <Textarea className="min-h-16" name="description" placeholder="Short note" />
              <label className="flex items-center gap-2 text-xs font-bold text-neutral-700">
                <input name="active" type="checkbox" value="true" defaultChecked className="h-4 w-4" />
                Active
              </label>
              <Button type="submit">Save tag</Button>
            </form>
          </CompactCreateCard>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Folders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {folders.map((folder) => (
              <div key={folder.id} className="rounded-md border border-[#e6ebdc] bg-[#fbfcf8] p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black">{folder.name}</p>
                      <StatusPill tone={folder.active ? "green" : "red"}>{folder.active ? "Active" : "Inactive"}</StatusPill>
                      <StatusPill>Sort {folder.sort_order}</StatusPill>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-neutral-500">{folder.description || "No description."}</p>
                  </div>
                  {canManage ? <FolderControls folder={folder} isAdmin={isAdmin} /> : null}
                </div>
              </div>
            ))}
            {!folders.length ? <EmptyState text="No folders yet." /> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Tag categories and tags</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {groupedTags.map((group) => (
              <section key={group.category.id} className="rounded-md border border-[#e6ebdc] bg-[#fbfcf8]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6ebdc] px-3 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black">{group.category.name}</p>
                      <StatusPill tone={group.category.active ? "green" : "red"}>{group.category.active ? "Active" : "Inactive"}</StatusPill>
                      <StatusPill>{group.tags.length} tags</StatusPill>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-neutral-500">{group.category.description || "No description."}</p>
                  </div>
                  {canManage ? <TagCategoryControls category={group.category} isAdmin={isAdmin} /> : null}
                </div>
                <div className="divide-y divide-[#e6ebdc]">
                  {group.tags.map((tag) => (
                    <div key={tag.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-black text-black">{tag.name}</p>
                          <StatusPill tone={tag.active ? "green" : "red"}>{tag.active ? "Active" : "Inactive"}</StatusPill>
                          <StatusPill>Sort {tag.sort_order}</StatusPill>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-neutral-500">{tag.description || "No description."}</p>
                      </div>
                      {canManage ? <TagControls tag={tag} categories={categories} isAdmin={isAdmin} /> : null}
                    </div>
                  ))}
                  {!group.tags.length ? <div className="px-3 py-4 text-sm text-neutral-500">No tags in this category yet.</div> : null}
                </div>
              </section>
            ))}
            {!groupedTags.length ? <EmptyState text="No tag categories yet." /> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CompactCreateCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function FolderControls({ folder, isAdmin }: { folder: QuoteFolder; isAdmin: boolean }) {
  return (
    <details className="rounded-md border border-[#d9ded1] bg-white">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-black text-black">
        <Pencil className="h-3.5 w-3.5" />
        Manage
      </summary>
      <div className="grid gap-3 border-t border-[#e6ebdc] p-3">
        <form action={updateQuoteFolder} className="grid gap-3">
          <input type="hidden" name="id" value={folder.id} />
          <Input name="name" defaultValue={folder.name} required />
          <Input name="sort_order" type="number" min="0" defaultValue={folder.sort_order} />
          <Textarea className="min-h-16" name="description" defaultValue={folder.description} />
          <label className="flex items-center gap-2 text-xs font-bold text-neutral-700">
            <input name="active" type="checkbox" value="true" defaultChecked={folder.active} className="h-4 w-4" />
            Active
          </label>
          <Button type="submit">Save</Button>
        </form>
        <div className="flex flex-wrap gap-2">
          <form action={toggleQuoteFolderActive}>
            <input type="hidden" name="id" value={folder.id} />
            <input type="hidden" name="active" value={String(!folder.active)} />
            <Button type="submit" variant="ghost">
              {folder.active ? <CircleOff className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
              {folder.active ? "Off" : "On"}
            </Button>
          </form>
          {isAdmin ? (
            <form action={deleteQuoteFolder}>
              <input type="hidden" name="id" value={folder.id} />
              <Button type="submit" variant="danger">
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </form>
          ) : null}
        </div>
      </div>
    </details>
  );
}

function TagCategoryControls({ category, isAdmin }: { category: PipelineTagCategory; isAdmin: boolean }) {
  return (
    <details className="rounded-md border border-[#d9ded1] bg-white">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-black text-black">
        <Pencil className="h-3.5 w-3.5" />
        Manage
      </summary>
      <div className="grid gap-3 border-t border-[#e6ebdc] p-3">
        <form action={updatePipelineTagCategory} className="grid gap-3">
          <input type="hidden" name="id" value={category.id} />
          <Input name="name" defaultValue={category.name} required />
          <Input name="sort_order" type="number" min="0" defaultValue={category.sort_order} />
          <Textarea className="min-h-16" name="description" defaultValue={category.description} />
          <label className="flex items-center gap-2 text-xs font-bold text-neutral-700">
            <input name="active" type="checkbox" value="true" defaultChecked={category.active} className="h-4 w-4" />
            Active
          </label>
          <Button type="submit">Save</Button>
        </form>
        <div className="flex flex-wrap gap-2">
          <form action={togglePipelineTagCategoryActive}>
            <input type="hidden" name="id" value={category.id} />
            <input type="hidden" name="active" value={String(!category.active)} />
            <Button type="submit" variant="ghost">
              {category.active ? <CircleOff className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
              {category.active ? "Off" : "On"}
            </Button>
          </form>
          {isAdmin ? (
            <form action={deletePipelineTagCategory}>
              <input type="hidden" name="id" value={category.id} />
              <Button type="submit" variant="danger">
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </form>
          ) : null}
        </div>
      </div>
    </details>
  );
}

function TagControls({
  tag,
  categories,
  isAdmin
}: {
  tag: PipelineTag;
  categories: PipelineTagCategory[];
  isAdmin: boolean;
}) {
  return (
    <details className="rounded-md border border-[#d9ded1] bg-white">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-black text-black">
        <Pencil className="h-3.5 w-3.5" />
        Manage
      </summary>
      <div className="grid gap-3 border-t border-[#e6ebdc] p-3">
        <form action={updatePipelineTag} className="grid gap-3">
          <input type="hidden" name="id" value={tag.id} />
          <Input name="name" defaultValue={tag.name} required />
          <Select name="category_id" defaultValue={tag.category_id ?? ""} required>
            <option value="">Select category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
          <Input name="sort_order" type="number" min="0" defaultValue={tag.sort_order} />
          <Textarea className="min-h-16" name="description" defaultValue={tag.description} />
          <label className="flex items-center gap-2 text-xs font-bold text-neutral-700">
            <input name="active" type="checkbox" value="true" defaultChecked={tag.active} className="h-4 w-4" />
            Active
          </label>
          <Button type="submit">Save</Button>
        </form>
        <div className="flex flex-wrap gap-2">
          <form action={togglePipelineTagActive}>
            <input type="hidden" name="id" value={tag.id} />
            <input type="hidden" name="active" value={String(!tag.active)} />
            <Button type="submit" variant="ghost">
              {tag.active ? <CircleOff className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
              {tag.active ? "Off" : "On"}
            </Button>
          </form>
          {isAdmin ? (
            <form action={deletePipelineTag}>
              <input type="hidden" name="id" value={tag.id} />
              <Button type="submit" variant="danger">
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </form>
          ) : null}
        </div>
      </div>
    </details>
  );
}

function groupTags(tags: PipelineTag[], categories: PipelineTagCategory[]) {
  const categoryOrder = new Map(categories.map((category, index) => [category.id, index]));
  return categories
    .map((category) => ({
      category,
      tags: tags.filter((tag) => tag.category_id === category.id)
    }))
    .sort((a, b) => (categoryOrder.get(a.category.id) ?? 999) - (categoryOrder.get(b.category.id) ?? 999));
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

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed border-[#d9ded1] p-6 text-center text-sm text-neutral-500">{text}</div>;
}

function friendlyReadError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("relation") || lower.includes("schema cache") || lower.includes("column")) {
    return "Pipeline folders and tags are missing in the database. Run migration 0006 in Supabase SQL Editor.";
  }
  return message;
}
