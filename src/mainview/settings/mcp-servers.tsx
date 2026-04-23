import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { type McpServerEntry, rpc } from "../providers/rpc";

interface EditRow extends McpServerEntry {
	key: string; // stable react key, synthesized from timestamp when adding
}

function toRow(server: McpServerEntry, index: number): EditRow {
	return { ...server, key: `row-${index}-${server.name}` };
}

function toServer(row: EditRow): McpServerEntry {
	const entry: McpServerEntry = {
		name: row.name.trim(),
		command: row.command.trim(),
		enabled: row.enabled,
	};
	const args = row.args?.filter((arg) => arg.length > 0);
	if (args && args.length > 0) entry.args = args;
	const envPairs = Object.entries(row.env ?? {}).filter(
		([k, v]) => k && typeof v === "string",
	);
	if (envPairs.length > 0) entry.env = Object.fromEntries(envPairs);
	return entry;
}

function isRowValid(row: EditRow): boolean {
	return row.name.trim().length > 0 && row.command.trim().length > 0;
}

export function McpServersSection() {
	const [rows, setRows] = useState<EditRow[]>([]);
	const [loaded, setLoaded] = useState(false);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		rpc.request
			.agentListMcpServers()
			.then((servers) => {
				setRows(servers.map(toRow));
				setLoaded(true);
			})
			.catch(() => setLoaded(true));
	}, []);

	const persist = useCallback(async (next: EditRow[]) => {
		setSaving(true);
		try {
			const servers = next.filter(isRowValid).map(toServer);
			await rpc.request.agentSaveMcpServers({ servers });
		} finally {
			setSaving(false);
		}
	}, []);

	function update(key: string, patch: Partial<EditRow>) {
		setRows((prev) => {
			const next = prev.map((r) => (r.key === key ? { ...r, ...patch } : r));
			persist(next);
			return next;
		});
	}

	function add() {
		const key = `row-${Date.now()}`;
		setRows((prev) => [
			...prev,
			{ key, name: "", command: "", args: [], env: {}, enabled: true },
		]);
	}

	function remove(key: string) {
		setRows((prev) => {
			const next = prev.filter((r) => r.key !== key);
			persist(next);
			return next;
		});
	}

	if (!loaded) return null;

	return (
		<div className="flex flex-col gap-2.5">
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-semibold">MCP Servers</h3>
				<Button
					size="sm"
					variant="outline"
					className="h-7 text-xs"
					onClick={add}
					disabled={saving}
				>
					<Plus className="h-3 w-3" />
					Adicionar
				</Button>
			</div>

			{rows.length === 0 && (
				<p className="text-[11px] text-muted-foreground">
					Nenhum servidor MCP configurado. Adicione um para expor ferramentas
					externas ao agente.
				</p>
			)}

			<div className="flex flex-col gap-2">
				{rows.map((row) => (
					<McpRow
						key={row.key}
						row={row}
						onChange={(patch) => update(row.key, patch)}
						onRemove={() => remove(row.key)}
						disabled={saving}
					/>
				))}
			</div>
		</div>
	);
}

function McpRow({
	row,
	onChange,
	onRemove,
	disabled,
}: {
	row: EditRow;
	onChange: (patch: Partial<EditRow>) => void;
	onRemove: () => void;
	disabled?: boolean;
}) {
	const invalid = !isRowValid(row);
	return (
		<div
			className={cn(
				"flex flex-col gap-2 rounded-lg border border-border/50 bg-card/40 p-3",
				invalid && "border-destructive/40",
			)}
		>
			<div className="flex items-center gap-2">
				<Input
					value={row.name}
					onChange={(e) => onChange({ name: e.target.value })}
					placeholder="nome-do-servidor"
					className="h-7 flex-1 text-xs"
					disabled={disabled}
				/>
				<Switch
					checked={row.enabled !== false}
					onCheckedChange={(v) => onChange({ enabled: v })}
					disabled={disabled}
				/>
				<Button
					size="sm"
					variant="ghost"
					className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
					onClick={onRemove}
					disabled={disabled}
					aria-label="Remover"
				>
					<Trash2 className="h-3 w-3" />
				</Button>
			</div>
			<Input
				value={row.command}
				onChange={(e) => onChange({ command: e.target.value })}
				placeholder="comando (ex.: npx)"
				className="h-7 text-xs font-mono"
				disabled={disabled}
			/>
			<Input
				value={(row.args ?? []).join(" ")}
				onChange={(e) =>
					onChange({
						args: e.target.value
							.split(/\s+/)
							.map((s) => s.trim())
							.filter((s) => s.length > 0),
					})
				}
				placeholder="argumentos (separados por espaço)"
				className="h-7 text-xs font-mono"
				disabled={disabled}
			/>
			<Input
				value={Object.entries(row.env ?? {})
					.map(([k, v]) => `${k}=${v}`)
					.join(" ")}
				onChange={(e) => {
					const env: Record<string, string> = {};
					for (const pair of e.target.value.split(/\s+/)) {
						const eq = pair.indexOf("=");
						if (eq > 0) env[pair.slice(0, eq)] = pair.slice(eq + 1);
					}
					onChange({ env });
				}}
				placeholder="env (K=V K2=V2)"
				className="h-7 text-xs font-mono"
				disabled={disabled}
			/>
			{invalid && (
				<p className="text-[10px] text-destructive">
					Nome e comando são obrigatórios.
				</p>
			)}
		</div>
	);
}
