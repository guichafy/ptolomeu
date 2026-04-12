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
import { GripVertical, Minus, Plus, Settings } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
	findPluginMeta,
	hasPluginConfig,
	PLUGIN_META,
	type PluginMeta,
} from "../providers/registry";
import { useSettings } from "./settings-context";

const MIN_ACTIVE = 1;
const MAX_ACTIVE = 5;

function ActivePluginRow({
	meta,
	canRemove,
	onRemove,
	onConfigure,
}: {
	meta: PluginMeta;
	canRemove: boolean;
	onRemove: () => void;
	onConfigure?: () => void;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: meta.id });

	const style: React.CSSProperties = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
	};

	const Icon = meta.icon;

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
				aria-label={`Arrastar ${meta.label}`}
				{...attributes}
				{...listeners}
			>
				<GripVertical className="h-4 w-4" />
			</button>
			<Icon className="h-4 w-4 text-muted-foreground" />
			<span className="flex-1 text-sm">{meta.label}</span>
			{onConfigure && (
				<button
					type="button"
					onClick={onConfigure}
					className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
					aria-label={`Configurar ${meta.label}`}
					title={`Configurar ${meta.label}`}
				>
					<Settings className="h-4 w-4" />
				</button>
			)}
			<button
				type="button"
				onClick={onRemove}
				disabled={!canRemove}
				className={cn(
					"rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground",
					"disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
				)}
				aria-label={`Desabilitar ${meta.label}`}
				title={
					canRemove
						? `Desabilitar ${meta.label}`
						: "Pelo menos um plugin deve estar ativo"
				}
			>
				<Minus className="h-4 w-4" />
			</button>
		</div>
	);
}

function AvailablePluginRow({
	meta,
	canAdd,
	onAdd,
}: {
	meta: PluginMeta;
	canAdd: boolean;
	onAdd: () => void;
}) {
	const Icon = meta.icon;
	return (
		<div className="flex items-center gap-3 rounded-md border border-border/30 bg-muted/30 px-3 py-2">
			<Icon className="h-4 w-4 text-muted-foreground" />
			<div className="flex flex-1 flex-col">
				<span className="text-sm">{meta.label}</span>
				<span className="text-xs text-muted-foreground">
					{meta.description}
				</span>
			</div>
			<button
				type="button"
				onClick={onAdd}
				disabled={!canAdd}
				className={cn(
					"rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground",
					"disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
				)}
				aria-label={`Habilitar ${meta.label}`}
				title={
					canAdd
						? `Habilitar ${meta.label}`
						: `Máximo de ${MAX_ACTIVE} plugins ativos`
				}
			>
				<Plus className="h-4 w-4" />
			</button>
		</div>
	);
}

export function PluginsSection({
	onNavigateToPlugin,
}: {
	onNavigateToPlugin?: (pluginId: string) => void;
} = {}) {
	const { enabledOrder, updateEnabledOrder } = useSettings();

	const activeMetas = useMemo(
		() =>
			enabledOrder
				.map((id) => findPluginMeta(id))
				.filter((m): m is PluginMeta => Boolean(m)),
		[enabledOrder],
	);

	const availableMetas = useMemo(
		() => PLUGIN_META.filter((m) => !enabledOrder.includes(m.id)),
		[enabledOrder],
	);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	function handleDragEnd(event: DragEndEvent) {
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		const oldIndex = enabledOrder.indexOf(String(active.id));
		const newIndex = enabledOrder.indexOf(String(over.id));
		if (oldIndex < 0 || newIndex < 0) return;
		updateEnabledOrder(arrayMove(enabledOrder, oldIndex, newIndex));
	}

	function handleRemove(id: string) {
		if (enabledOrder.length <= MIN_ACTIVE) return;
		updateEnabledOrder(enabledOrder.filter((x) => x !== id));
	}

	function handleAdd(id: string) {
		if (enabledOrder.length >= MAX_ACTIVE) return;
		updateEnabledOrder([...enabledOrder, id]);
	}

	const canRemove = enabledOrder.length > MIN_ACTIVE;
	const canAdd = enabledOrder.length < MAX_ACTIVE;

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-1">
				<div className="flex items-center justify-between">
					<h2 className="text-lg font-semibold">Plugins</h2>
					<span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
						{enabledOrder.length}/{MAX_ACTIVE} ativos
					</span>
				</div>
				<p className="text-xs text-muted-foreground/80">
					Arraste para reordenar. A ordem define o ciclo do Tab na paleta.
				</p>
			</div>

			<DndContext
				sensors={sensors}
				collisionDetection={closestCenter}
				onDragEnd={handleDragEnd}
			>
				<SortableContext
					items={enabledOrder}
					strategy={verticalListSortingStrategy}
				>
					<div className="flex flex-col gap-1.5">
						{activeMetas.map((meta) => (
							<ActivePluginRow
								key={meta.id}
								meta={meta}
								canRemove={canRemove}
								onRemove={() => handleRemove(meta.id)}
								onConfigure={
									hasPluginConfig(meta.id) && onNavigateToPlugin
										? () => onNavigateToPlugin(meta.id)
										: undefined
								}
							/>
						))}
					</div>
				</SortableContext>
			</DndContext>

			{availableMetas.length > 0 && (
				<div className="flex flex-col gap-2">
					<h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
						Disponíveis
					</h3>
					<div className="flex flex-col gap-1.5">
						{availableMetas.map((meta) => (
							<AvailablePluginRow
								key={meta.id}
								meta={meta}
								canAdd={canAdd}
								onAdd={() => handleAdd(meta.id)}
							/>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
