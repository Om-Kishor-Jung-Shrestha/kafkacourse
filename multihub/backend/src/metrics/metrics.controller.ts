import { Controller, Get, Header, NotFoundException } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { env } from '../config/env';

// Scraped by Prometheus (see infra/prometheus/prometheus.yml). Intentionally
// unauthenticated and outside /api so Kong routing changes never affect it.
// Served on the SAME port as the rest of the app (3001) — there is no
// separate metrics port; METRICS_PORT does not exist as a config option
// for exactly that reason (avoids a dead/misleading env var).
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain')
  async getMetrics(): Promise<string> {
    if (!env.metricsEnabled) throw new NotFoundException();
    return this.metrics.registry.metrics();
  }
}
