import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.ts";

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    app.getHttpAdapter().getInstance().disable("x-powered-by");

    await app.listen(5000);
}

await bootstrap();
