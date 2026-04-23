/**
 * AI Elements `Attachments` — thumbnail strip with a remove affordance per
 * item. API mirrors https://elements.ai-sdk.dev/r/attachments.json.
 *
 * The composer passes raw base64 data URIs here; the container is purely
 * presentational and doesn't touch the filesystem.
 */

import { ImageIcon, X } from "lucide-react";
import { type ComponentProps, forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface Attachment {
	id: string;
	dataUrl: string;
	mimeType: string;
	name?: string;
	sizeBytes?: number;
}

export interface AttachmentsProps extends ComponentProps<"div"> {
	items: Attachment[];
	onRemove?: (id: string) => void;
}

export const Attachments = forwardRef<HTMLDivElement, AttachmentsProps>(
	({ items, onRemove, className, ...props }, ref) => {
		if (items.length === 0) return null;
		return (
			<div
				ref={ref}
				data-slot="attachments"
				className={cn("flex flex-wrap gap-1.5", className)}
				{...props}
			>
				{items.map((item) => (
					<AttachmentThumb
						key={item.id}
						attachment={item}
						onRemove={onRemove ? () => onRemove(item.id) : undefined}
					/>
				))}
			</div>
		);
	},
);
Attachments.displayName = "Attachments";

function AttachmentThumb({
	attachment,
	onRemove,
}: {
	attachment: Attachment;
	onRemove?: () => void;
}) {
	const isImage = attachment.mimeType.startsWith("image/");
	return (
		<div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-border/60 bg-muted/40">
			{isImage ? (
				<img
					src={attachment.dataUrl}
					alt={attachment.name ?? "imagem anexada"}
					className="h-full w-full object-cover"
				/>
			) : (
				<div className="flex h-full w-full items-center justify-center text-muted-foreground">
					<ImageIcon className="h-4 w-4" />
				</div>
			)}
			{onRemove && (
				<Button
					type="button"
					size="sm"
					variant="secondary"
					onClick={onRemove}
					className="absolute -right-1 -top-1 h-4 w-4 rounded-full p-0 shadow-sm"
					aria-label="Remover anexo"
				>
					<X className="h-2.5 w-2.5" />
				</Button>
			)}
		</div>
	);
}
