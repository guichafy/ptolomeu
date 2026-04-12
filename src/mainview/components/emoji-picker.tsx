import { useState } from "react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";

const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
	{
		label: "Favoritos",
		emojis: ["⭐", "🔍", "🚀", "💡", "🔥", "✨", "💎", "🎯"],
	},
	{
		label: "Dev",
		emojis: ["🐛", "🔧", "⚙️", "🧪", "📦", "🏗️", "🔀", "🛡️"],
	},
	{
		label: "Status",
		emojis: ["✅", "❌", "⚠️", "🚧", "📌", "🏷️", "📋", "📊"],
	},
	{
		label: "Org",
		emojis: ["🏢", "👥", "🌐", "📁", "🗂️", "📂", "🔒", "🔓"],
	},
	{
		label: "Misc",
		emojis: ["💬", "📝", "🎨", "🧩", "🔗", "📡", "⚡", "🌟"],
	},
];

interface Props {
	value: string;
	onChange: (emoji: string) => void;
}

export function EmojiPicker({ value, onChange }: Props) {
	const [open, setOpen] = useState(false);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="flex h-9 w-full items-center justify-center rounded-md border border-input bg-transparent text-lg shadow-sm transition-colors hover:bg-accent"
				>
					{value || "⭐"}
				</button>
			</PopoverTrigger>
			<PopoverContent className="w-[220px] p-2" align="end">
				<div className="flex flex-col gap-2">
					{EMOJI_GROUPS.map((group) => (
						<div key={group.label}>
							<div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-foreground/40">
								{group.label}
							</div>
							<div className="grid grid-cols-8 gap-0.5">
								{group.emojis.map((emoji) => (
									<button
										key={emoji}
										type="button"
										className="flex h-7 w-7 items-center justify-center rounded text-sm transition-colors hover:bg-accent"
										onClick={() => {
											onChange(emoji);
											setOpen(false);
										}}
									>
										{emoji}
									</button>
								))}
							</div>
						</div>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}
