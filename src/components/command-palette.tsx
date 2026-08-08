import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { q } from "@/lib/data";
import { useApp } from "@/lib/app-context";
import { engagementsQuery } from "@/lib/engagements/queries";
import { brandLabel, displayName } from "@/lib/engagements/domain";

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, openAdd, setNotificationsOpen } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(!paletteOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, setPaletteOpen]);

  const brands = useQuery({ queryKey: ["brands"], queryFn: q.brands, enabled: paletteOpen });
  const projects = useQuery({ queryKey: ["projects"], queryFn: q.projects, enabled: paletteOpen });
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: q.tasks, enabled: paletteOpen });
  const orgs = useQuery({ queryKey: ["organizations"], queryFn: q.organizations, enabled: paletteOpen });
  const contacts = useQuery({ queryKey: ["contacts"], queryFn: q.contacts, enabled: paletteOpen });
  const deals = useQuery({ queryKey: ["deals"], queryFn: q.deals, enabled: paletteOpen });
  const activities = useQuery({
    queryKey: ["activities", 50],
    queryFn: () => q.activities(50),
    enabled: paletteOpen,
  });
  const engagements = useQuery({ ...engagementsQuery({}), enabled: paletteOpen });

  const brandById = useMemo(
    () => new Map((brands.data ?? []).map((b) => [b.id, b])),
    [brands.data]
  );
  const projById = useMemo(
    () => new Map((projects.data ?? []).map((p) => [p.id, p])),
    [projects.data]
  );

  const go = (to: string) => {
    setPaletteOpen(false);
    navigate({ to });
  };

  const goEngagement = (id: string) => {
    setPaletteOpen(false);
    navigate({ to: "/engagements", search: { id } as never });
  };

  return (
    <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
      <CommandInput placeholder="Search brands, projects, tasks, deals, contacts… or run an action" />
      <CommandList>
        <CommandEmpty>Nothing matched.</CommandEmpty>

        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => { setPaletteOpen(false); openAdd("task"); }}>
            <span className="font-sans text-[10px] uppercase tracking-wider text-teal mr-2">CAP</span>
            Add task
          </CommandItem>
          <CommandItem onSelect={() => { setPaletteOpen(false); openAdd("activity"); }}>
            <span className="font-sans text-[10px] uppercase tracking-wider text-teal mr-2">CAP</span>
            Log activity
          </CommandItem>
          <CommandItem onSelect={() => { setPaletteOpen(false); openAdd("metric"); }}>
            <span className="font-sans text-[10px] uppercase tracking-wider text-teal mr-2">CAP</span>
            Record metric
          </CommandItem>
          <CommandItem onSelect={() => { setPaletteOpen(false); openAdd("project"); }}>
            <span className="font-sans text-[10px] uppercase tracking-wider text-teal mr-2">PLN</span>
            Add project
          </CommandItem>
          <CommandItem onSelect={() => { setPaletteOpen(false); openAdd("deal"); }}>
            <span className="font-sans text-[10px] uppercase tracking-wider text-teal mr-2">PLN</span>
            Add deal
          </CommandItem>
          <CommandItem
            value="action notifications inbox alerts"
            onSelect={() => {
              setPaletteOpen(false);
              setNotificationsOpen(true);
            }}
          >
            <span className="font-sans text-[10px] uppercase tracking-wider text-teal mr-2">GO</span>
            Open notifications
          </CommandItem>
          <CommandItem value="action morning brief what changed" onSelect={() => go("/")}>
            <span className="font-sans text-[10px] uppercase tracking-wider text-teal mr-2">GO</span>
            Read morning brief
          </CommandItem>
          <CommandItem value="action command center control room" onSelect={() => go("/command")}>
            <span className="font-sans text-[10px] uppercase tracking-wider text-teal mr-2">GO</span>
            Open command center
          </CommandItem>
        </CommandGroup>

        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => go("/")}>Morning Brief</CommandItem>
          <CommandItem onSelect={() => go("/command")}>Command Center</CommandItem>
          <CommandItem onSelect={() => go("/portfolio")}>Portfolio</CommandItem>
          <CommandItem onSelect={() => go("/projects")}>Projects</CommandItem>
          <CommandItem onSelect={() => go("/tasks")}>Tasks</CommandItem>
          <CommandItem onSelect={() => go("/crm")}>CRM</CommandItem>
          <CommandItem onSelect={() => go("/engagements")}>Engagements</CommandItem>
          <CommandItem onSelect={() => go("/analytics")}>Analytics</CommandItem>
          <CommandItem onSelect={() => go("/integrations")}>Integrations</CommandItem>
          <CommandItem onSelect={() => go("/data-health")}>Data Health</CommandItem>
          <CommandItem onSelect={() => go("/settings")}>Settings</CommandItem>
        </CommandGroup>

        <CommandGroup heading="Engagements">
          {(engagements.data ?? []).slice(0, 40).map((e) => (
            <CommandItem
              key={e.id}
              value={`engagement ${displayName(e)} ${e.email ?? ""} ${brandLabel(e.brand_key)}`}
              onSelect={() => goEngagement(e.id)}
            >
              <Tag>ENG</Tag>
              <span className="truncate">{displayName(e)}</span>
              <span className="ml-auto font-sans text-[10px] text-muted-foreground">
                {brandLabel(e.brand_key)}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Brands">
          {(brands.data ?? []).map((b) => (
            <CommandItem key={b.id} onSelect={() => go(`/brand/${b.slug}`)}>
              <Tag>BRAND</Tag>
              {b.name}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Projects">
          {(projects.data ?? []).slice(0, 30).map((p) => (
            <CommandItem
              key={p.id}
              value={`project ${p.name} ${brandById.get(p.brand_id)?.name ?? ""}`}
              onSelect={() => go("/projects")}
            >
              <Tag>PROJ</Tag>
              <span className="truncate">{p.name}</span>
              <span className="ml-auto font-sans text-[10px] text-muted-foreground">
                {brandById.get(p.brand_id)?.name ?? ""}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Tasks">
          {(tasks.data ?? [])
            .filter((t) => t.status !== "completed" && t.status !== "archived")
            .slice(0, 40)
            .map((t) => {
              const proj = projById.get(t.project_id);
              const brand = proj ? brandById.get(proj.brand_id) : null;
              return (
                <CommandItem
                  key={t.id}
                  value={`task ${t.title} ${proj?.name ?? ""} ${brand?.name ?? ""}`}
                  onSelect={() => go("/tasks")}
                >
                  <Tag>TASK</Tag>
                  <span className="truncate">{t.title}</span>
                  <span className="ml-auto font-sans text-[10px] text-muted-foreground">
                    {brand?.name ?? "—"}
                  </span>
                </CommandItem>
              );
            })}
        </CommandGroup>

        <CommandGroup heading="Organizations">
          {(orgs.data ?? []).map((o) => (
            <CommandItem key={o.id} value={`org ${o.name}`} onSelect={() => go("/crm")}>
              <Tag>ORG</Tag>
              {o.name}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Contacts">
          {(contacts.data ?? []).map((c) => (
            <CommandItem key={c.id} value={`contact ${c.full_name}`} onSelect={() => go("/crm")}>
              <Tag>CT</Tag>
              {c.full_name}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Deals">
          {(deals.data ?? []).map((d) => (
            <CommandItem key={d.id} value={`deal ${d.name}`} onSelect={() => go("/crm")}>
              <Tag>DEAL</Tag>
              {d.name}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Recent Activity">
          {(activities.data ?? []).slice(0, 20).map((a) => (
            <CommandItem key={a.id} value={`activity ${a.subject}`} onSelect={() => go("/crm")}>
              <Tag>ACT</Tag>
              <span className="truncate">{a.subject}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="mr-2 font-sans text-[9.5px] uppercase tracking-[0.06em] text-teal/80 w-10 inline-block">
      {children}
    </span>
  );
}