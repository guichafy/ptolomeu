interface CalculatorResultProps {
  expression: string
  result: string | null
  error: string | null
  onCopy: () => void
}

export function CalculatorResult({ expression, result, error, onCopy }: CalculatorResultProps) {
  if (!expression.trim()) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Digite uma expressão matemática...
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2">
      <p className="text-4xl font-bold font-mono text-green-400">
        = {result}
      </p>
      <p className="text-xs text-muted-foreground/60">
        ↵ copiar resultado
      </p>
    </div>
  )
}
