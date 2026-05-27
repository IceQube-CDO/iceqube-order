import re

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

schedule_start = html.find('<!-- Step 3: SCHEDULE -->')
logistics_start = html.find('<!-- Step 4: LOGISTICS (Nested Flow) -->')
payment_start = html.find('<!-- Step 5: PAYMENT -->')

schedule_block = html[schedule_start:logistics_start]
logistics_block = html[logistics_start:payment_start]

# modify schedule_block
schedule_block = schedule_block.replace('<!-- Step 3: SCHEDULE -->', '<!-- Step 4: SCHEDULE -->')
schedule_block = schedule_block.replace('onclick="app.nextStep()"', 'onclick="app.goToPayment()"')
schedule_block = schedule_block.replace('Continue to Logistics', 'Continue to Payment')

# modify logistics_block
logistics_block = logistics_block.replace('<!-- Step 4: LOGISTICS (Nested Flow) -->', '<!-- Step 3: LOGISTICS (Nested Flow) -->')
logistics_block = logistics_block.replace('onclick="app.goToPayment()"', 'onclick="app.nextStep()"')
logistics_block = logistics_block.replace('Continue to Payment', 'Continue to Schedule')

new_html = html[:schedule_start] + logistics_block + schedule_block + html[payment_start:]

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(new_html)
print("Updated index.html successfully.")
