fetch("https://tbbezmpobjdkwpoflfcs.supabase.co/rest/v1/orders?order_id=in.(%22%23IQ-72081%22,%22%23IQ-62502%22)", {
  headers: {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRiYmV6bXBvYmpka3dwb2ZsZmNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2OTI1MzIsImV4cCI6MjA5MjI2ODUzMn0.Wt3wDzE8CBpBEQCa2rb8OJM42uBEL8bjWlddqc0yWJs',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRiYmV6bXBvYmpka3dwb2ZsZmNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2OTI1MzIsImV4cCI6MjA5MjI2ODUzMn0.Wt3wDzE8CBpBEQCa2rb8OJM42uBEL8bjWlddqc0yWJs'
  }
})
.then(res => res.json())
.then(data => console.log(JSON.stringify(data, null, 2)))
.catch(err => console.error(err));
