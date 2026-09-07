import {useState} from 'react'
import {render,screen,fireEvent} from '@testing-library/react'
import {expect,it} from 'vitest'
import ServicePricingFields from './ServicePricingFields'
function Form(){const[form,setForm]=useState({price:450});return <ServicePricingFields form={form} onChange={(name,value)=>setForm({...form,[name]:value})}/>}
it('shows only relevant fields for each pricing mode',()=>{
 render(<Form/>);
 expect(screen.getByLabelText('قیمت نهایی (تومان)')).toHaveValue(450)
 fireEvent.change(screen.getByLabelText('نوع قیمت'),{target:{value:'RANGE'}})
 expect(screen.queryByLabelText('قیمت نهایی (تومان)')).not.toBeInTheDocument()
 expect(screen.getByLabelText('حداکثر قیمت (تومان)')).toBeRequired()
 fireEvent.change(screen.getByLabelText('نوع قیمت'),{target:{value:'CONSULTATION'}})
 expect(screen.queryByLabelText('حداقل قیمت (تومان)')).not.toBeInTheDocument()
 fireEvent.change(screen.getByLabelText('نوع قیمت'),{target:{value:'VARIABLE'}})
 expect(screen.getByLabelText('قیمت پایه — اختیاری (تومان)')).not.toBeRequired()
 expect(screen.getByLabelText('توضیح قیمت')).toBeRequired()
})
