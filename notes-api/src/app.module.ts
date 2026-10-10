import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AppController } from "./app.controller.ts";
import { AppService } from "./app.service.ts";
import { AccessTokenGuard } from "./auth/access-token.guard.ts";

@Module({
    imports: [],
    controllers: [AppController],
    providers: [
        AppService,
        // Global: every route requires a valid access token unless marked @Public().
        { provide: APP_GUARD, useClass: AccessTokenGuard },
    ],
})
export class AppModule {}
