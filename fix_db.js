const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const defaultData = [
            { name: 'Juan Bautista', nickname: 'Juan', role: 'Rider', designation: 'Rider', phone: '0917 123 4567', messenger: 'jb_rider_123', address: 'Carmen, CDO', tin: '123-456-789-000', sss: '33-1234567-8', philhealth: '12-345678901-2', pagibig: '1211-3333-4444', rate: '₱500/day', currentWeekTotal: '₱3,000', currentMonthTotal: '₱12,000', status: 'Active', avatar: 'JB', deliveries: 48, roleCategory: 'Rider' },
            { name: 'Ricky Mercado', nickname: 'Ricky', role: 'Rider', designation: 'Rider', phone: '0918 999 8888', messenger: 'ricky_m88', address: 'Macasandig, CDO', tin: '987-654-321-000', sss: '33-7654321-8', philhealth: '12-098765432-1', pagibig: '1211-4444-5555', rate: '₱500/day', currentWeekTotal: '₱2,500', currentMonthTotal: '₱10,000', status: 'Inactive', avatar: 'RM', deliveries: 32, roleCategory: 'Rider' },
            { name: 'Dindo Lopez', nickname: 'Dindo', role: 'Plant Op', designation: 'Hub Staff', phone: '0915 444 3322', messenger: 'dindo_plant_op', address: 'Bulua, CDO', tin: '111-222-333-000', sss: '33-1122334-8', philhealth: '12-112233445-1', pagibig: '1211-1111-2222', rate: '₱600/day', currentWeekTotal: '₱3,600', currentMonthTotal: '₱14,400', status: 'Active', avatar: 'DL', deliveries: 0, roleCategory: 'Hub Staff' },
            { name: 'Maria Santos', nickname: 'Maria', role: 'Admin', designation: 'Admin Officer', phone: '0919 111 2222', messenger: 'maria_admin', address: 'Gusa, CDO', tin: '444-555-666-000', sss: '33-4455667-8', philhealth: '12-445566778-1', pagibig: '1211-6666-7777', rate: '₱800/day', currentWeekTotal: '₱4,800', currentMonthTotal: '₱19,200', status: 'Active', avatar: 'MS', deliveries: 0, roleCategory: 'Admin Officer' },
            { name: 'Lawrence Fernandez', nickname: 'Lawrence', role: 'Admin', designation: 'Admin Officer', phone: 'N/A', messenger: '100041737997302', address: 'Lapasan, CDO', tin: 'N/A', sss: 'N/A', philhealth: 'N/A', pagibig: 'N/A', rate: '₱800/day', currentWeekTotal: '₱4,800', currentMonthTotal: '₱19,200', status: 'Active', avatar: 'LA', deliveries: 0, roleCategory: 'Admin Officer' },
            { name: 'Ian Echano', nickname: 'Ian', role: 'Admin', designation: 'Admin Officer', phone: 'N/A', messenger: '61557321703652', address: 'CDO', tin: 'N/A', sss: 'N/A', philhealth: 'N/A', pagibig: 'N/A', rate: '₱800/day', currentWeekTotal: '₱4,800', currentMonthTotal: '₱19,200', status: 'Active', avatar: 'IE', deliveries: 0, roleCategory: 'Admin Officer' }
        ];

fetch(`${SUPABASE_URL}/rest/v1/orders?order_id=eq.CONFIG_ICEQUBE_TEAM_MEMBERS`, {
    method: 'PATCH',
    headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ items: defaultData })
}).then(res => {
    console.log("Fix Status:", res.status);
});
