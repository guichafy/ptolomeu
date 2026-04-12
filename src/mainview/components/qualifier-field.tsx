import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type {
	QualifierDef,
	QualifierValue,
	RangeValue,
} from "../providers/github/qualifier-registry";
import { RANGE_OPERATORS } from "../providers/github/qualifier-registry";

interface Props {
	def: QualifierDef;
	value: QualifierValue;
	onChange: (value: QualifierValue) => void;
	onRemove: () => void;
}

function SelectField({
	def,
	value,
	onChange,
}: {
	def: QualifierDef;
	value: string;
	onChange: (v: string) => void;
}) {
	return (
		<Select value={value} onValueChange={onChange}>
			<SelectTrigger className="h-7 flex-1 text-xs">
				<SelectValue placeholder="Selecionar..." />
			</SelectTrigger>
			<SelectContent>
				{def.options?.map((opt) => (
					<SelectItem key={opt} value={opt.toLowerCase()}>
						{opt}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

function TextField({
	def,
	value,
	onChange,
}: {
	def: QualifierDef;
	value: string;
	onChange: (v: string) => void;
}) {
	return (
		<Input
			className="h-7 flex-1 text-xs"
			value={value}
			onChange={(e) => onChange(e.target.value)}
			placeholder={def.placeholder}
		/>
	);
}

function RangeField({
	value,
	onChange,
	placeholder,
}: {
	value: RangeValue;
	onChange: (v: RangeValue) => void;
	placeholder?: string;
}) {
	return (
		<div className="flex flex-1 gap-1">
			<Select
				value={value.op}
				onValueChange={(op) =>
					onChange({ ...value, op: op as RangeValue["op"] })
				}
			>
				<SelectTrigger className="h-7 w-16 text-xs">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{RANGE_OPERATORS.map((op) => (
						<SelectItem key={op} value={op}>
							{op}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Input
				className="h-7 flex-1 text-xs"
				value={value.value}
				onChange={(e) => onChange({ ...value, value: e.target.value })}
				placeholder={placeholder}
			/>
		</div>
	);
}

function BooleanField({
	def,
	value,
	onChange,
}: {
	def: QualifierDef;
	value: string;
	onChange: (v: string) => void;
}) {
	return (
		<div className="flex flex-1 gap-1">
			{def.booleanOptions?.map((opt) => (
				<button
					key={opt.value}
					type="button"
					className={cn(
						"rounded-md border px-2 py-0.5 text-xs transition-colors",
						value === opt.value
							? "border-blue-500 bg-blue-500/20 text-blue-400"
							: "border-border text-muted-foreground hover:bg-accent",
					)}
					onClick={() => onChange(opt.value)}
				>
					{opt.label}
				</button>
			))}
		</div>
	);
}

export function QualifierField({ def, value, onChange, onRemove }: Props) {
	return (
		<div className="flex items-center gap-2 rounded-md border border-border/50 bg-card px-2 py-1.5">
			<span className="w-[70px] shrink-0 text-[11px] font-medium text-amber-400/90">
				{def.label}
			</span>

			{def.type === "select" && (
				<SelectField def={def} value={value as string} onChange={onChange} />
			)}
			{def.type === "text" && (
				<TextField def={def} value={value as string} onChange={onChange} />
			)}
			{def.type === "number-range" && (
				<RangeField
					value={value as RangeValue}
					onChange={onChange}
					placeholder={def.placeholder}
				/>
			)}
			{def.type === "boolean" && (
				<BooleanField def={def} value={value as string} onChange={onChange} />
			)}

			<button
				type="button"
				className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
				onClick={onRemove}
			>
				<X className="h-3.5 w-3.5" />
			</button>
		</div>
	);
}
