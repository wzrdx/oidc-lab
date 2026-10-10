import { Module } from "@nestjs/common";
import { NotesController } from "./notes.controller.ts";
import { NotesService } from "./notes.service.ts";

@Module({
    controllers: [NotesController],
    providers: [NotesService],
})
export class NotesModule {}
