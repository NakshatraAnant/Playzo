/** Country data for Geography Sprint: [name, capital, continent, flag emoji]. */
export type Country = [string, string, string, string];
const f = (cc: string) => String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

export const COUNTRIES: Country[] = [
  ['India', 'New Delhi', 'Asia', f('in')], ['China', 'Beijing', 'Asia', f('cn')], ['Japan', 'Tokyo', 'Asia', f('jp')],
  ['Nepal', 'Kathmandu', 'Asia', f('np')], ['Bangladesh', 'Dhaka', 'Asia', f('bd')], ['Sri Lanka', 'Sri Jayawardenepura Kotte', 'Asia', f('lk')],
  ['Bhutan', 'Thimphu', 'Asia', f('bt')], ['Thailand', 'Bangkok', 'Asia', f('th')], ['Vietnam', 'Hanoi', 'Asia', f('vn')],
  ['Indonesia', 'Jakarta', 'Asia', f('id')], ['Malaysia', 'Kuala Lumpur', 'Asia', f('my')], ['Philippines', 'Manila', 'Asia', f('ph')],
  ['South Korea', 'Seoul', 'Asia', f('kr')], ['Saudi Arabia', 'Riyadh', 'Asia', f('sa')], ['United Arab Emirates', 'Abu Dhabi', 'Asia', f('ae')],
  ['Singapore', 'Singapore', 'Asia', f('sg')], ['Mongolia', 'Ulaanbaatar', 'Asia', f('mn')], ['Maldives', 'Malé', 'Asia', f('mv')],
  ['Afghanistan', 'Kabul', 'Asia', f('af')], ['Iran', 'Tehran', 'Asia', f('ir')], ['Qatar', 'Doha', 'Asia', f('qa')],
  ['France', 'Paris', 'Europe', f('fr')], ['Germany', 'Berlin', 'Europe', f('de')], ['Italy', 'Rome', 'Europe', f('it')],
  ['Spain', 'Madrid', 'Europe', f('es')], ['Portugal', 'Lisbon', 'Europe', f('pt')], ['United Kingdom', 'London', 'Europe', f('gb')],
  ['Ireland', 'Dublin', 'Europe', f('ie')], ['Netherlands', 'Amsterdam', 'Europe', f('nl')], ['Belgium', 'Brussels', 'Europe', f('be')],
  ['Switzerland', 'Bern', 'Europe', f('ch')], ['Austria', 'Vienna', 'Europe', f('at')], ['Greece', 'Athens', 'Europe', f('gr')],
  ['Norway', 'Oslo', 'Europe', f('no')], ['Sweden', 'Stockholm', 'Europe', f('se')], ['Finland', 'Helsinki', 'Europe', f('fi')],
  ['Denmark', 'Copenhagen', 'Europe', f('dk')], ['Poland', 'Warsaw', 'Europe', f('pl')], ['Hungary', 'Budapest', 'Europe', f('hu')],
  ['Iceland', 'Reykjavik', 'Europe', f('is')], ['Czechia', 'Prague', 'Europe', f('cz')], ['Ukraine', 'Kyiv', 'Europe', f('ua')],
  ['Egypt', 'Cairo', 'Africa', f('eg')], ['Kenya', 'Nairobi', 'Africa', f('ke')], ['Nigeria', 'Abuja', 'Africa', f('ng')],
  ['South Africa', 'Pretoria', 'Africa', f('za')], ['Ethiopia', 'Addis Ababa', 'Africa', f('et')], ['Ghana', 'Accra', 'Africa', f('gh')],
  ['Morocco', 'Rabat', 'Africa', f('ma')], ['Tanzania', 'Dodoma', 'Africa', f('tz')], ['Uganda', 'Kampala', 'Africa', f('ug')],
  ['Senegal', 'Dakar', 'Africa', f('sn')], ['Algeria', 'Algiers', 'Africa', f('dz')], ['Madagascar', 'Antananarivo', 'Africa', f('mg')],
  ['Rwanda', 'Kigali', 'Africa', f('rw')], ['Zimbabwe', 'Harare', 'Africa', f('zw')],
  ['United States', 'Washington, D.C.', 'North America', f('us')], ['Canada', 'Ottawa', 'North America', f('ca')],
  ['Mexico', 'Mexico City', 'North America', f('mx')], ['Cuba', 'Havana', 'North America', f('cu')], ['Jamaica', 'Kingston', 'North America', f('jm')],
  ['Costa Rica', 'San José', 'North America', f('cr')], ['Panama', 'Panama City', 'North America', f('pa')],
  ['Brazil', 'Brasília', 'South America', f('br')], ['Argentina', 'Buenos Aires', 'South America', f('ar')],
  ['Chile', 'Santiago', 'South America', f('cl')], ['Peru', 'Lima', 'South America', f('pe')], ['Colombia', 'Bogotá', 'South America', f('co')],
  ['Uruguay', 'Montevideo', 'South America', f('uy')], ['Ecuador', 'Quito', 'South America', f('ec')], ['Venezuela', 'Caracas', 'South America', f('ve')],
  ['Australia', 'Canberra', 'Oceania', f('au')], ['New Zealand', 'Wellington', 'Oceania', f('nz')], ['Fiji', 'Suva', 'Oceania', f('fj')],
  ['Papua New Guinea', 'Port Moresby', 'Oceania', f('pg')], ['Samoa', 'Apia', 'Oceania', f('ws')],
];
export const CONTINENTS = ['Asia', 'Europe', 'Africa', 'North America', 'South America', 'Oceania'];
