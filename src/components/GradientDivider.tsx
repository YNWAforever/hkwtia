const GradientDivider = ({ variant = "primary" }: { variant?: "primary" | "warm" | "cool" | "multi" }) => {
  const gradients = {
    primary: "from-transparent via-primary/20 to-transparent",
    warm: "from-transparent via-accent/20 to-transparent",
    cool: "from-transparent via-secondary/20 to-transparent",
    multi: "from-primary/10 via-accent/15 to-secondary/10",
  };
  return (
    <div className="relative h-px w-full overflow-hidden">
      <div className={`absolute inset-0 bg-gradient-to-r ${gradients[variant]}`} />
      <div
        className="absolute inset-0 opacity-50"
        style={{
          background: "linear-gradient(90deg, transparent 0%, hsl(var(--primary) / 0.3) 25%, hsl(var(--accent) / 0.4) 50%, hsl(var(--secondary) / 0.3) 75%, transparent 100%)",
        }}
      />
    </div>
  );
};

export default GradientDivider;
