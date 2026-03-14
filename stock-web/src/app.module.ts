import { Module } from '@nestjs/common';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';
import { AiAnalysisService } from './ai-analysis.service';

@Module({
  imports: [],
  controllers: [StockController],
  providers: [StockService, AiAnalysisService],
})
export class AppModule {}
