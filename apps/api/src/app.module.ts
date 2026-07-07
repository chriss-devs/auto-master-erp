import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AuditoriaModule } from './auditoria/auditoria.module';
import { AuthModule } from './auth/auth.module';
import { CajaModule } from './caja/caja.module';
import { CatalogoModule } from './catalogo/catalogo.module';
import { ClientesModule } from './clientes/clientes.module';
import { AuthGuard } from './common/auth.guard';
import { PrismaModule } from './common/prisma.service';
import { DashboardModule } from './dashboard/dashboard.module';
import { FacturacionModule } from './facturacion/facturacion.module';
import { InventarioModule } from './inventario/inventario.module';
import { ProveedoresModule } from './proveedores/proveedores.module';
import { VentasModule } from './ventas/ventas.module';

/** Monolito modular por dominios (ADR-0002, 10 §3). */
@Module({
  imports: [
    PrismaModule,
    AuditoriaModule,
    AuthModule,
    CatalogoModule,
    InventarioModule,
    ClientesModule,
    ProveedoresModule,
    VentasModule,
    CajaModule,
    FacturacionModule,
    DashboardModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
