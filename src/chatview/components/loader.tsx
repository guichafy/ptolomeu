export function Loader() {
	return (
		<div className="flex items-center gap-1 py-2 px-1">
			<span
				className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce"
				style={{ animationDelay: "0ms" }}
			/>
			<span
				className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce"
				style={{ animationDelay: "150ms" }}
			/>
			<span
				className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce"
				style={{ animationDelay: "300ms" }}
			/>
		</div>
	);
}
