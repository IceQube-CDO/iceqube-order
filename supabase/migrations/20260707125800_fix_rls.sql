CREATE POLICY "Allow anyone to select subscriptions" ON public.admin_push_subscriptions FOR SELECT USING (true);
