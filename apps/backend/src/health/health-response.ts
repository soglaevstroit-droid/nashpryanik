export interface HealthResponse {
  status: 'ok';
  appName: string;
  environment: string;
  timestamp: string;
}

export interface ReadinessResponse extends HealthResponse {
  database: {
    connected: boolean;
  };
}
