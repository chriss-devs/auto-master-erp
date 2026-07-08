"use client";

import { ProductoForm } from "@/components/producto-form";

export default function ProductoNuevoPage() {
  return (
    <div className="space-y-3">
      <h1 className="text-lg font-bold">Producto nuevo</h1>
      <ProductoForm />
    </div>
  );
}
