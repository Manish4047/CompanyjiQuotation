import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import type { QuoteFilterParams } from "@/lib/quotes/filters";
import { normalizeTagName } from "@/lib/pipeline-taxonomy";

type FilterTag = {
  name: string;
  category_name?: string | null;
};

type FilterFolder = {
  id: string;
  name: string;
};

export function QuoteFilters({
  action,
  params,
  categories = [],
  folders = [],
  tags = [],
  showSort = false
}: {
  action: string;
  params: QuoteFilterParams;
  categories?: string[];
  folders?: FilterFolder[];
  tags?: FilterTag[];
  showSort?: boolean;
}) {
  const groupedTags = groupTags(tags);

  return (
    <Card>
      <CardContent>
        <form action={action} className="grid gap-4 lg:grid-cols-4 2xl:grid-cols-8 lg:items-end">
          <Field label="Period">
            <Select name="period" defaultValue={params.period ?? ""}>
              <option value="">All time</option>
              <option value="last7">Last 7 days</option>
              <option value="this_month">This month</option>
              <option value="last30">Last 30 days</option>
              <option value="custom">Custom dates</option>
            </Select>
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue={params.status ?? ""}>
              <option value="">Any status</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="viewed">Viewed</option>
              <option value="negotiating">Negotiating</option>
              <option value="accepted">Accepted</option>
              <option value="lost">Lost</option>
              <option value="expired">Expired</option>
            </Select>
          </Field>
          <Field label="Folder">
            <Select name="folder" defaultValue={params.folder ?? ""}>
              <option value="">Any folder</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Category">
            <Select name="category" defaultValue={params.category ?? ""}>
              <option value="">Any category</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tag">
            <Select name="tag" defaultValue={params.tag ?? ""}>
              <option value="">Any tag</option>
              {groupedTags.map((group) => (
                <optgroup key={group.category} label={group.category}>
                  {group.tags.map((tag) => (
                    <option key={tag.name} value={normalizeTagName(tag.name)}>
                      {tag.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>
          <Field label="From">
            <Input name="from" type="date" defaultValue={params.from ?? ""} />
          </Field>
          <Field label="To">
            <Input name="to" type="date" defaultValue={params.to ?? ""} />
          </Field>
          {showSort ? (
            <Field label="Sort">
              <Select name="sort" defaultValue={params.sort ?? "recent"}>
                <option value="recent">Newest first</option>
                <option value="followup_asc">Follow-up first</option>
                <option value="followup_desc">Follow-up latest</option>
                <option value="amount_desc">Highest amount</option>
                <option value="amount_asc">Lowest amount</option>
                <option value="opens_desc">Most opens</option>
                <option value="client_asc">Client A-Z</option>
              </Select>
            </Field>
          ) : null}
          <div className="lg:col-span-full flex justify-end">
            <Button type="submit" variant="ghost">
              <Filter className="h-4 w-4" />
              Filter
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function groupTags(tags: FilterTag[]) {
  const grouped = tags.reduce<Record<string, FilterTag[]>>((groups, tag) => {
    const category = tag.category_name || "General";
    groups[category] = [...(groups[category] ?? []), tag];
    return groups;
  }, {});

  return Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, groupTags]) => ({
      category,
      tags: groupTags.sort((a, b) => a.name.localeCompare(b.name))
    }));
}
