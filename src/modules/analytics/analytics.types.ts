// src/modules/analytics/analytics.types.ts

export type CampaignAnalyticsRow = {
    campaign_id: string;
    campaign_name: string;
    template_name: string;
    total_recipients: number;
    delivered_count: number;
    failed_count: number;
    delivery_percent: number;
  };
  
  export type TemplateAnalyticsRow = {
    template_name: string;
    total_messages: number;
    delivered_count: number;
    failed_count: number;
    delivery_percent: number;
  };
  
  export type ModelAnalyticsRow = {
    model: string;
    total_messages: number;
    delivered_count: number;
    failed_count: number;
    delivery_percent: number;
  };
  
  export type FailureAnalyticsRow = {
    failure_reason: string;
    failure_count: number;
  };
  