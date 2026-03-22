import { Module } from '@nestjs/common';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';
import { AiAnalysisService } from './ai-analysis.service';
import { AgentPredictionController } from './agent-prediction.controller';
import { AgentPredictionService } from './agent-prediction.service';

@Module({
  imports: [],
  controllers: [StockController, AgentPredictionController],
  providers: [StockService, AiAnalysisService, AgentPredictionService],
})
export class AppModule {}
