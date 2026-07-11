fetch("https://tbbezmpobjdkwpoflfcs.supabase.co/functions/v1/messenger-webhook", {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRiYmV6bXBvYmpka3dwb2ZsZmNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2OTI1MzIsImV4cCI6MjA5MjI2ODUzMn0.Wt3wDzE8CBpBEQCa2rb8OJM42uBEL8bjWlddqc0yWJs'
  },
  body: JSON.stringify({
    action: 'test_tags',
    recipientId: '35739506415692916'
  })
})
.then(res => res.json())
.then(data => console.log(JSON.stringify(data, null, 2)))
.catch(err => console.error(err));
