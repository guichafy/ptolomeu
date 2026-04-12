import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
	QUALIFIER_REGISTRY,
	type QualifierValue,
	type QualifierValues,
	type RangeValue,
} from "../providers/github/qualifier-registry";
import { buildQuery, parseQuery } from "../providers/github/query-builder";
import type { GitHubSearchType } from "../providers/rpc";
import { QualifierField } from "./qualifier-field";
import { QualifierPicker } from "./qualifier-picker";
import { QueryPreview } from "./query-preview";

interface Props {
	baseType: GitHubSearchType;
	initialQualifiers: string;
	onChange: (qualifiers: string) => void;
}

function getDefaultValue(type: string): QualifierValue {
	if (type === "number-range") return { op: ">=", value: "" } as RangeValue;
	return "";
}

export function QueryBuilderPanel({
	baseType,
	initialQualifiers,
	onChange,
}: Props) {
	const [values, setValues] = useState<QualifierValues>(new Map());
	const [activeKeys, setActiveKeys] = useState<string[]>([]);
	const [remainder, setRemainder] = useState("");
	const initDone = useRef(false);

	// Initialize from existing qualifiers string
	useEffect(() => {
		if (initDone.current) return;
		initDone.current = true;

		if (initialQualifiers.trim()) {
			const parsed = parseQuery(baseType, initialQualifiers);
			setValues(parsed.values);
			setActiveKeys(Array.from(parsed.values.keys()));
			setRemainder(parsed.remainder);
		}
	}, [baseType, initialQualifiers]);

	// Reset when baseType changes
	const prevBaseType = useRef(baseType);
	useEffect(() => {
		if (prevBaseType.current !== baseType) {
			prevBaseType.current = baseType;
			setValues(new Map());
			setActiveKeys([]);
			setRemainder("");
			initDone.current = true;
			onChange("");
		}
	}, [baseType, onChange]);

	const currentQuery = useMemo(() => {
		const built = buildQuery(baseType, values);
		return [built, remainder].filter(Boolean).join(" ");
	}, [baseType, values, remainder]);

	function handleValueChange(key: string, value: QualifierValue) {
		setValues((prev) => {
			const next = new Map(prev);
			next.set(key, value);
			return next;
		});
	}

	// Propagate changes to parent (skip first mount to avoid resetting initialQualifiers)
	useEffect(() => {
		if (!initDone.current) return;
		onChange(currentQuery);
	}, [currentQuery, onChange]);

	function handleAddQualifier(key: string) {
		const def = QUALIFIER_REGISTRY[baseType].find((d) => d.key === key);
		if (!def) return;

		setActiveKeys((prev) => [...prev, key]);
		setValues((prev) => {
			const next = new Map(prev);
			next.set(key, getDefaultValue(def.type));
			return next;
		});
	}

	function handleRemoveQualifier(key: string) {
		setActiveKeys((prev) => prev.filter((k) => k !== key));
		setValues((prev) => {
			const next = new Map(prev);
			next.delete(key);
			return next;
		});
	}

	function handleQueryEdit(raw: string) {
		const parsed = parseQuery(baseType, raw);
		setValues(parsed.values);
		setActiveKeys(Array.from(parsed.values.keys()));
		setRemainder(parsed.remainder);
	}

	const registry = QUALIFIER_REGISTRY[baseType];
	const activeKeySet = new Set(activeKeys);

	return (
		<div className="flex h-[360px] gap-0 rounded-md border border-border/30">
			{/* Left: Builder */}
			<div className="flex flex-1 flex-col p-3">
				<div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-foreground/60">
					Qualifiers
				</div>

				<ScrollArea className="flex-1">
					<div className="flex flex-col gap-1.5">
						{activeKeys.map((key) => {
							const def = registry.find((d) => d.key === key);
							if (!def) return null;
							const val = values.get(key) ?? getDefaultValue(def.type);
							return (
								<QualifierField
									key={key}
									def={def}
									value={val}
									onChange={(v) => handleValueChange(key, v)}
									onRemove={() => handleRemoveQualifier(key)}
								/>
							);
						})}
					</div>
				</ScrollArea>

				<div className="mt-2">
					<QualifierPicker
						baseType={baseType}
						activeKeys={activeKeySet}
						onSelect={handleAddQualifier}
					/>
				</div>
			</div>

			<Separator orientation="vertical" />

			{/* Right: Preview */}
			<div className="flex flex-1 flex-col p-3">
				<QueryPreview
					query={currentQuery}
					baseType={baseType}
					onQueryEdit={handleQueryEdit}
				/>
			</div>
		</div>
	);
}
