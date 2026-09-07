import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {expect,it,vi} from 'vitest'
import ItemPricing from './ItemPricing'
import {api} from '../shared/api'
vi.mock('../shared/api',()=>({api:{post:vi.fn()},toman:value=>`${value} تومان`}))
it('saves an agreed price without replacing the catalog estimate',async()=>{
 const saved=vi.fn();api.post.mockResolvedValue({})
 render(<ItemPricing role="employee" onSaved={saved} item={{id:7,pricing_type:'STARTING_FROM',catalog_pricing_snapshot:{pricing_type:'STARTING_FROM',minimum_price:2000},is_price_final:false,price_status:'estimated'}} />)
 expect(screen.getByText('قیمت اعلام‌شده: از 2000 تومان')).toBeVisible()
 fireEvent.change(screen.getByLabelText('قیمت نهایی توافق‌شده (تومان)'),{target:{value:'3850'}})
 fireEvent.click(screen.getByRole('button',{name:'ذخیره قیمت'}))
 await waitFor(()=>expect(api.post).toHaveBeenCalledWith('employee/appointment-items/7/final-price/',{final_price:3850}))
 expect(saved).toHaveBeenCalledOnce()
})
