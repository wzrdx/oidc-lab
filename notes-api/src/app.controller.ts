import { Controller, Get } from "@nestjs/common";
import { AppService } from "./app.service.ts";
import { Public } from "./auth/public.decorator.ts";

@Controller()
export class AppController {
    constructor(private readonly appService: AppService) {}

    @Public() // health check
    @Get()
    getHello(): string {
        return this.appService.getHello();
    }
}
