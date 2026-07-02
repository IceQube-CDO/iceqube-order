CREATE TABLE public.admin_push_subscriptions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    endpoint text UNIQUE NOT NULL,
    keys_p256dh text NOT NULL,
    keys_auth text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Allow admins (or anyone, depending on RLS) to insert subscriptions
ALTER TABLE public.admin_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anyone to insert push subscriptions" ON public.admin_push_subscriptions
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow anyone to update their own subscription" ON public.admin_push_subscriptions
    FOR UPDATE USING (true);
