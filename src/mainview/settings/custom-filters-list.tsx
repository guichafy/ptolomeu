import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CustomFilter } from "../providers/github/types";
import { rpc } from "../providers/rpc";
import { CustomFilterDialog } from "./custom-filter-dialog";
import { useSettings } from "./settings-context";

function FilterRow({
	filter,
	onEdit,
	onDelete,
}: {
	filter: CustomFilter;
	onEdit: () => void;
	onDelete: () => void;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: filter.id });
	const style: React.CSSProperties = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
	};
	const subtitle =
		filter.kind === "team-repos"
			? `Team repos · ${filter.org}/${filter.team}`
			: `${filter.baseType} · ${filter.qualifiers || "(sem qualificadores)"}`;
	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn(
				"flex items-center gap-2 rounded-md border border-border/50 bg-card px-2 py-2",
				isDragging && "ring-1 ring-ring",
			)}
		>
			<button
				type="button"
				className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
				aria-label="Arrastar"
				{...attributes}
				{...listeners}
			>
				<GripVertical className="h-4 w-4" />
			</button>
			<span className="text-base">{filter.icon ?? "⭐"}</span>
			<div className="flex flex-1 flex-col">
				<span className="text-sm">{filter.name}</span>
				<span className="text-xs text-muted-foreground">{subtitle}</span>
			</div>
			<button
				type="button"
				onClick={onEdit}
				className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
				aria-label="Editar"
			>
				<Pencil className="h-3.5 w-3.5" />
			</button>
			<button
				type="button"
				onClick={onDelete}
				className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
				aria-label="Excluir"
			>
				<Trash2 className="h-3.5 w-3.5" />
			</button>
		</div>
	);
}

export function CustomFiltersList() {
	const { customFilters, updateCustomFilters } = useSettings();
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editing, setEditing] = useState<CustomFilter | undefined>(undefined);
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	function handleDragEnd(event: DragEndEvent) {
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		const oldIndex = customFilters.findIndex((f) => f.id === active.id);
		const newIndex = customFilters.findIndex((f) => f.id === over.id);
		if (oldIndex < 0 || newIndex < 0) return;
		updateCustomFilters(arrayMove(customFilters, oldIndex, newIndex));
	}

	function handleDelete(filter: CustomFilter) {
		updateCustomFilters(customFilters.filter((f) => f.id !== filter.id));
		rpc.request.githubInvalidateCache().catch(() => {});
	}

	function handleSave(filter: CustomFilter) {
		const existing = customFilters.find((f) => f.id === filter.id);
		if (existing) {
			updateCustomFilters(
				customFilters.map((f) => (f.id === filter.id ? filter : f)),
			);
		} else {
			updateCustomFilters([...customFilters, filter]);
		}
		rpc.request.githubInvalidateCache().catch(() => {});
	}

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-semibold">Filtros customizados</h3>
				<Button
					size="sm"
					variant="outline"
					onClick={() => {
						setEditing(undefined);
						setDialogOpen(true);
					}}
				>
					<Plus className="mr-1 h-3 w-3" />
					Novo filtro
				</Button>
			</div>
			<p className="text-xs text-muted-foreground">
				Aparecem abaixo dos tipos nativos no combobox da busca.
			</p>
			{customFilters.length === 0 ? (
				<div className="rounded-md border border-dashed border-border/50 p-4 text-center text-xs text-muted-foreground">
					Nenhum filtro cadastrado
				</div>
			) : (
				<DndContext
					sensors={sensors}
					collisionDetection={closestCenter}
					onDragEnd={handleDragEnd}
				>
					<SortableContext
						items={customFilters.map((f) => f.id)}
						strategy={verticalListSortingStrategy}
					>
						<div className="flex flex-col gap-1.5">
							{customFilters.map((f) => (
								<FilterRow
									key={f.id}
									filter={f}
									onEdit={() => {
										setEditing(f);
										setDialogOpen(true);
									}}
									onDelete={() => handleDelete(f)}
								/>
							))}
						</div>
					</SortableContext>
				</DndContext>
			)}
			<CustomFilterDialog
				open={dialogOpen}
				initial={editing}
				onClose={() => setDialogOpen(false)}
				onSave={handleSave}
			/>
		</div>
	);
}
