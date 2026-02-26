declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

declare module "https://esm.sh/openai@4.47.0" {
  const OpenAI: any;
  export default OpenAI;
}

declare module "https://esm.sh/@google/generative-ai" {
  export const GoogleGenerativeAI: any;
}

declare module "https://esm.sh/@supabase/supabase-js@2.43.4" {
  export const createClient: any;
}

declare module "https://deno.land/std@0.177.0/http/server.ts" {
  export const serve: any;
}
